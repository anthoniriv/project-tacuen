// src/features/tacuen/model/validators.ts

import type { ReceiptModel, ReceiptItem, Allocation, Person, MoneyCents } from "./types";
import { fromCents } from "./money";
import { computeReceiptTotals } from "./calculator";

export type ValidationError = {
  field: string;
  message: string;
  severity: "error" | "warning"; // error = bloquea, warning = informa pero permite avanzar
};

export type WizardStep = 1 | 2 | 3 | 4 | 5;

/**
 * Valida un paso específico del wizard
 * STEP 1 (upload): validar que hay imagen u OCR result
 * STEP 2 (items): validar items, NO validar people aquí
 * STEP 3 (people): validar people.length >= 1
 * STEP 4 (split): validar allocations consistentes
 * STEP 5 (summary): validar rounding etc
 */
export function validateStep(
  step: WizardStep,
  model: ReceiptModel | null
): ValidationError[] {
  if (!model) {
    return [{ field: "model", message: "No hay modelo cargado", severity: "error" }];
  }

  const errors: ValidationError[] = [];

  switch (step) {
    case 1:
      // Upload: validar que hay items o que se puede cargar
      // Esta validación se hace antes de crear el modelo, así que no aplica aquí
      break;

    case 2:
      // Items: validar que hay >=1 item, qty>=1, totalCents>=0
      // NO validar people aquí
      if (model.items.length === 0) {
        errors.push({
          field: "items",
          message: "Debe haber al menos un ítem",
          severity: "error",
        });
      }

      // Validar cada item
      for (const item of model.items) {
        if (item.qty <= 0) {
          errors.push({
            field: "items",
            message: `Cantidad inválida para ${item.name}: ${item.qty}`,
            severity: "error",
          });
        }

        if (item.unitPriceCents < 0) {
          errors.push({
            field: "items",
            message: `Precio unitario inválido para ${item.name}`,
            severity: "error",
          });
        }

        if (item.totalCents < 0) {
          errors.push({
            field: "items",
            message: `Total inválido para ${item.name}`,
            severity: "error",
          });
        }

        // Coherencia: total ≈ qty * unitPrice (permitir pequeñas diferencias por redondeo)
        if (!item.isFree && item.qty > 0 && item.unitPriceCents > 0) {
          const expectedCents = Math.round(item.qty * item.unitPriceCents);
          const diff = Math.abs(item.totalCents - expectedCents);
          if (diff > 1) {
            // Más de 1 centavo de diferencia
            errors.push({
              field: "items",
              message: `Incoherencia en ${item.name}: total=${fromCents(
                item.totalCents
              ).toFixed(2)} pero qty*unitPrice=${fromCents(expectedCents).toFixed(2)}`,
              severity: "warning", // Warning, no bloquea
            });
          }
        }
      }

      // Verificar mismatch entre totalDetected y computedTotal (warning, no error)
      const receiptTotals = computeReceiptTotals(model, model.countryCode);
      if (receiptTotals.hasMismatch) {
        errors.push({
          field: "total",
          message: `El total detectado (${fromCents(
            model.totalDetectedCents
          ).toFixed(2)}) no coincide con el total calculado (${fromCents(
            receiptTotals.computedGrandTotalCents
          ).toFixed(2)}). Diferencia: ${fromCents(receiptTotals.differenceCents).toFixed(2)}`,
          severity: "warning", // Warning, no bloquea
        });
      }
      break;

    case 3:
      // People: validar people.length >= 1
      if (model.people.length === 0) {
        errors.push({
          field: "people",
          message: "Debe haber al menos una persona",
          severity: "error",
        });
      }

      // Validar nombres únicos
      const personNames = new Set<string>();
      for (const person of model.people) {
        if (!person.name || person.name.trim().length === 0) {
          errors.push({
            field: "people",
            message: "El nombre de la persona no puede estar vacío",
            severity: "error",
          });
        }

        const nameLower = person.name.toLowerCase();
        if (personNames.has(nameLower)) {
          errors.push({
            field: "people",
            message: `Persona duplicada: ${person.name}`,
            severity: "error",
          });
        }
        personNames.add(nameLower);
      }
      break;

    case 4:
      // Split: validar allocations consistentes
      if (model.people.length === 0) {
        errors.push({
          field: "people",
          message: "Debe haber al menos una persona para asignar items",
          severity: "error",
        });
      }

      const allocationItemIds = new Set<string>();
      for (const alloc of model.allocations) {
        if (allocationItemIds.has(alloc.itemId)) {
          errors.push({
            field: "allocations",
            message: `Múltiples allocations para el mismo ítem: ${alloc.itemId}`,
            severity: "error",
          });
        }
        allocationItemIds.add(alloc.itemId);

        const item = model.items.find((i) => i.id === alloc.itemId);
        if (!item) {
          errors.push({
            field: "allocations",
            message: `Allocation referencia un ítem inexistente: ${alloc.itemId}`,
            severity: "error",
          });
          continue;
        }

        if (item.isFree) continue; // Bonificaciones no necesitan allocation

        // Validar según el modo
        switch (alloc.mode) {
          case "all":
            if (alloc.participants.length !== model.people.length) {
              errors.push({
                field: "allocations",
                message: `Allocation "all" debe incluir todas las personas`,
                severity: "error",
              });
            }
            break;

          case "equal_selected":
            if (alloc.participants.length === 0) {
              errors.push({
                field: "allocations",
                message: `Allocation "equal_selected" debe tener al menos un participante`,
                severity: "error",
              });
            }
            break;

          case "portions":
            if (!alloc.portions || Object.keys(alloc.portions).length === 0) {
              errors.push({
                field: "allocations",
                message: `Allocation "portions" debe tener al menos una porción`,
                severity: "error",
              });
            } else {
              const totalPortions = Object.values(alloc.portions).reduce((a, b) => a + b, 0);
              const diff = Math.abs(totalPortions - item.qty);
              if (diff > 0.01) {
                errors.push({
                  field: "allocations",
                  message: `La suma de porciones (${totalPortions}) no coincide con la cantidad del ítem (${item.qty})`,
                  severity: "warning",
                });
              }
            }
            break;

          case "fixed_amount":
            if (!alloc.fixedAmounts || Object.keys(alloc.fixedAmounts).length === 0) {
              errors.push({
                field: "allocations",
                message: `Allocation "fixed_amount" debe tener al menos un monto`,
                severity: "error",
              });
            } else {
              const totalAmountsCents = Object.values(alloc.fixedAmounts).reduce(
                (a, b) => a + b,
                0
              );
              const diff = Math.abs(totalAmountsCents - item.totalCents);
              if (diff > 1) {
                // Más de 1 centavo de diferencia
                errors.push({
                  field: "allocations",
                  message: `La suma de montos fijos no coincide con el total del ítem`,
                  severity: "warning",
                });
              }
            }
            break;
        }

        // Verificar que los participants existan
        for (const personId of alloc.participants) {
          if (!model.people.find((p) => p.id === personId)) {
            errors.push({
              field: "allocations",
              message: `Persona inexistente en participants: ${personId}`,
              severity: "error",
            });
          }
        }
      }

      // Todos los items no gratis deben tener allocation
      for (const item of model.items) {
        if (!item.isFree && !allocationItemIds.has(item.id)) {
          errors.push({
            field: "allocations",
            message: `El ítem "${item.name}" no tiene asignación`,
            severity: "error",
          });
        }
      }
      break;

    case 5:
      // Summary: validaciones finales de rounding
      const totals = computeReceiptTotals(model, model.countryCode);
      if (totals.hasMismatch) {
        errors.push({
          field: "total",
          message: `Diferencia significativa entre total detectado y calculado: ${fromCents(
            totals.differenceCents
          ).toFixed(2)}. Considera ajustar los ítems o fees.`,
          severity: "warning",
        });
      }
      break;
  }

  return errors;
}

/**
 * Valida el modelo completo (para validación general)
 * @deprecated Usar validateStep en su lugar
 */
export function validateReceiptModel(model: ReceiptModel): ValidationError[] {
  // Agregar validaciones globales que apliquen a todos los pasos
  const errors: ValidationError[] = [];

  if (!model.name || model.name.trim().length === 0) {
    errors.push({ field: "name", message: "El nombre del evento es requerido", severity: "error" });
  }

  return errors;
}

/**
 * Verifica si el modelo está listo para calcular en un paso específico
 */
export function isStepReady(step: WizardStep, model: ReceiptModel | null): boolean {
  if (!model) return false;

  const errors = validateStep(step, model);
  const blockingErrors = errors.filter((e) => e.severity === "error");
  return blockingErrors.length === 0;
}
