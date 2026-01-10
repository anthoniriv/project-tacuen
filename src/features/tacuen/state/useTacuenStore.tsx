// src/features/tacuen/state/useTacuenStore.tsx

"use client";

import { createContext, useContext, useReducer, useCallback, useEffect, ReactNode } from "react";
import type {
  ReceiptModel,
  ReceiptItem,
  Person,
  Allocation,
  FeeModel,
  AllocationMode,
  RoundingStrategy,
} from "../model/types";
import { validateStep, isStepReady, type ValidationError, type WizardStep } from "../model/validators";
import { computeTotalsByPerson, computeReceiptTotals } from "../model/calculator";
import type { CalculationSummary } from "../model/types";

type TacuenState = {
  model: ReceiptModel | null;
  summary: CalculationSummary | null;
  errors: ValidationError[]; // Ahora incluye severity
  currentStep: number; // 0 = home, 1 = items, 2 = people, 3 = split, 4 = summary
  history: ReceiptModel[]; // último evento + historial (max 10)
};

type TacuenAction =
  | { type: "SET_MODEL"; payload: ReceiptModel }
  | { type: "UPDATE_ITEM"; payload: { itemId: string; updates: Partial<ReceiptItem> } }
  | { type: "ADD_ITEM"; payload: ReceiptItem }
  | { type: "REMOVE_ITEM"; payload: string }
  | { type: "UPDATE_PERSON"; payload: { personId: string; updates: Partial<Person> } }
  | { type: "ADD_PERSON"; payload: Person }
  | { type: "REMOVE_PERSON"; payload: string }
  | { type: "UPDATE_ALLOCATION"; payload: { itemId: string; allocation: Allocation } }
  | { type: "UPDATE_FEE"; payload: { index: number; fee: FeeModel } }
  | { type: "ADD_FEE"; payload: FeeModel }
  | { type: "REMOVE_FEE"; payload: number }
  | { type: "SET_ROUNDING"; payload: { step: number; strategy: RoundingStrategy } }
  | { type: "SET_STEP"; payload: number }
  | { type: "VALIDATE" }
  | { type: "CALCULATE" }
  | { type: "LOAD_FROM_HISTORY"; payload: ReceiptModel }
  | { type: "SAVE_TO_HISTORY" }
  | { type: "RESET" };

const initialState: TacuenState = {
  model: null,
  summary: null,
  errors: [],
  currentStep: 0,
  history: [],
};

/**
 * Helper para actualizar el modelo y recalcular totales y validaciones
 */
function updateModelWithValidation(
  model: ReceiptModel,
  currentStep: number
): {
  model: ReceiptModel;
  errors: ValidationError[];
  summary: CalculationSummary | null;
} {
  // Recalcular totales
  const receiptTotals = computeReceiptTotals(model, model.countryCode);
  const updatedModel = {
    ...model,
    computedTotalCents: receiptTotals.computedGrandTotalCents,
  };

  // Validar según el paso actual
  const step = (currentStep || 2) as WizardStep;
  const errors = step > 0 ? validateStep(step, updatedModel) : [];

  // Solo calcular summary si hay personas
  let summary: CalculationSummary | null = null;
  if (updatedModel.people.length > 0 && isStepReady(step, updatedModel)) {
    summary = computeTotalsByPerson(updatedModel);
  }

  return { model: updatedModel, errors, summary };
}

function tacuenReducer(state: TacuenState, action: TacuenAction): TacuenState {
  switch (action.type) {
    case "SET_MODEL": {
      const { model: updatedModel, errors, summary } = updateModelWithValidation(action.payload, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "UPDATE_ITEM": {
      if (!state.model) return state;
      const { itemId, updates } = action.payload;
      const model: ReceiptModel = {
        ...state.model,
        items: state.model.items.map((item) =>
          item.id === itemId ? { ...item, ...updates } : item
        ),
      };
      // Recalcular totales
      const receiptTotals = computeReceiptTotals(model, model.countryCode);
      const updatedModel = {
        ...model,
        computedTotalCents: receiptTotals.computedGrandTotalCents,
      };
      
      const step = (state.currentStep || 2) as WizardStep;
      const errors = validateStep(step, updatedModel);
      
      let summary: CalculationSummary | null = null;
      if (updatedModel.people.length > 0 && isStepReady(step, updatedModel)) {
        summary = computeTotalsByPerson(updatedModel);
      }
      
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "ADD_ITEM": {
      if (!state.model) return state;
      const model: ReceiptModel = {
        ...state.model,
        items: [...state.model.items, action.payload],
        allocations: [
          ...state.model.allocations,
          {
            itemId: action.payload.id,
            mode: "all",
            participants: state.model.people.map((p) => p.id),
          },
        ],
      };
      const { model: updatedModel, errors, summary } = updateModelWithValidation(model, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "REMOVE_ITEM": {
      if (!state.model) return state;
      const model: ReceiptModel = {
        ...state.model,
        items: state.model.items.filter((item) => item.id !== action.payload),
        allocations: state.model.allocations.filter((a) => a.itemId !== action.payload),
      };
      const { model: updatedModel, errors, summary } = updateModelWithValidation(model, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "UPDATE_PERSON": {
      if (!state.model) return state;
      const { personId, updates } = action.payload;
      const model: ReceiptModel = {
        ...state.model,
        people: state.model.people.map((person) =>
          person.id === personId ? { ...person, ...updates } : person
        ),
      };
      const { model: updatedModel, errors, summary } = updateModelWithValidation(model, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "ADD_PERSON": {
      if (!state.model) return state;
      const model: ReceiptModel = {
        ...state.model,
        people: [...state.model.people, action.payload],
        // Actualizar allocations "all" para incluir nueva persona
        allocations: state.model.allocations.map((alloc) => {
          if (alloc.mode === "all") {
            return {
              ...alloc,
              participants: [...alloc.participants, action.payload.id],
            };
          }
          return alloc;
        }),
      };
      const { model: updatedModel, errors, summary } = updateModelWithValidation(model, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "REMOVE_PERSON": {
      if (!state.model) return state;
      const personId = action.payload;
      const model: ReceiptModel = {
        ...state.model,
        people: state.model.people.filter((p) => p.id !== personId),
        allocations: state.model.allocations.map((alloc) => ({
          ...alloc,
          participants: alloc.participants.filter((pid) => pid !== personId),
          portions: alloc.portions
            ? Object.fromEntries(
                Object.entries(alloc.portions).filter(([pid]) => pid !== personId)
              )
            : undefined,
          fixedAmounts: alloc.fixedAmounts
            ? Object.fromEntries(
                Object.entries(alloc.fixedAmounts).filter(([pid]) => pid !== personId)
              )
            : undefined,
        })),
      };
      const { model: updatedModel, errors, summary } = updateModelWithValidation(model, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "UPDATE_ALLOCATION": {
      if (!state.model) return state;
      const { itemId, allocation } = action.payload;
      const model: ReceiptModel = {
        ...state.model,
        allocations: state.model.allocations.map((a) =>
          a.itemId === itemId ? allocation : a
        ),
      };
      const { model: updatedModel, errors, summary } = updateModelWithValidation(model, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "UPDATE_FEE": {
      if (!state.model) return state;
      const { index, fee } = action.payload;
      const model: ReceiptModel = {
        ...state.model,
        fees: state.model.fees.map((f, i) => (i === index ? fee : f)),
      };
      const { model: updatedModel, errors, summary } = updateModelWithValidation(model, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "ADD_FEE": {
      if (!state.model) return state;
      const model: ReceiptModel = {
        ...state.model,
        fees: [...state.model.fees, action.payload],
      };
      const { model: updatedModel, errors, summary } = updateModelWithValidation(model, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "REMOVE_FEE": {
      if (!state.model) return state;
      const model: ReceiptModel = {
        ...state.model,
        fees: state.model.fees.filter((_, i) => i !== action.payload),
      };
      const { model: updatedModel, errors, summary } = updateModelWithValidation(model, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "SET_ROUNDING": {
      if (!state.model) return state;
      const { step, strategy } = action.payload;
      const model: ReceiptModel = {
        ...state.model,
        roundingStep: step,
        roundingStrategy: strategy,
      };
      const { model: updatedModel, errors, summary } = updateModelWithValidation(model, state.currentStep);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
      };
    }

    case "SET_STEP":
      return { ...state, currentStep: action.payload };

    case "VALIDATE": {
      if (!state.model) return state;
      const step = (state.currentStep || 2) as WizardStep;
      const errors = validateStep(step, state.model);
      return { ...state, errors };
    }

    case "CALCULATE": {
      if (!state.model) return state;
      const step = (state.currentStep || 2) as WizardStep;
      // Solo calcular si hay personas
      if (state.model.people.length > 0 && isStepReady(step, state.model)) {
        const summary = computeTotalsByPerson(state.model);
        return { ...state, summary };
      }
      return state;
    }

    case "LOAD_FROM_HISTORY": {
      const { model: updatedModel, errors, summary } = updateModelWithValidation(action.payload, 1);
      return {
        ...state,
        model: updatedModel,
        errors,
        summary,
        currentStep: 1, // Ir a items después de cargar
      };
    }

    case "SAVE_TO_HISTORY": {
      if (!state.model) return state;
      const history = [state.model, ...state.history.filter((m) => m.id !== state.model!.id)].slice(0, 10);
      // Persistir en localStorage
      if (typeof window !== "undefined") {
        try {
          localStorage.setItem("tacuen_last_event", JSON.stringify(state.model));
          localStorage.setItem("tacuen_history", JSON.stringify(history));
        } catch (e) {
          console.error("Error saving to localStorage:", e);
        }
      }
      return { ...state, history };
    }

    case "RESET":
      return initialState;

    default:
      return state;
  }
}

const TacuenContext = createContext<
  | {
      state: TacuenState;
      dispatch: React.Dispatch<TacuenAction>;
      actions: {
        setModel: (model: ReceiptModel) => void;
        updateItem: (itemId: string, updates: Partial<ReceiptItem>) => void;
        addItem: (item: ReceiptItem) => void;
        removeItem: (itemId: string) => void;
        updatePerson: (personId: string, updates: Partial<Person>) => void;
        addPerson: (person: Person) => void;
        removePerson: (personId: string) => void;
        updateAllocation: (itemId: string, allocation: Allocation) => void;
        updateFee: (index: number, fee: FeeModel) => void;
        addFee: (fee: FeeModel) => void;
        removeFee: (index: number) => void;
        setRounding: (step: number, strategy: RoundingStrategy) => void;
        setStep: (step: number) => void;
        validate: () => void;
        calculate: () => void;
        loadFromHistory: (model: ReceiptModel) => void;
        saveToHistory: () => void;
        reset: () => void;
        loadFromLocalStorage: () => void;
      };
    }
  | undefined
>(undefined);

export function TacuenProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(tacuenReducer, initialState);

  // Cargar desde localStorage al montar
  const loadFromLocalStorage = useCallback(() => {
    if (typeof window === "undefined") return;
    try {
      const lastEvent = localStorage.getItem("tacuen_last_event");
      const history = localStorage.getItem("tacuen_history");
      
      if (lastEvent) {
        const model = JSON.parse(lastEvent) as ReceiptModel;
        dispatch({ type: "SET_MODEL", payload: model });
      }
      
      if (history) {
        const historyArray = JSON.parse(history) as ReceiptModel[];
        // El historial se guarda en el state cuando se necesite mostrar
        // Por ahora no lo cargamos automáticamente
      }
    } catch (e) {
      console.error("Error loading from localStorage:", e);
    }
  }, []);

  // Cargar desde localStorage en el primer render
  useEffect(() => {
    loadFromLocalStorage();
  }, [loadFromLocalStorage]);

  const actions = {
    setModel: useCallback((model: ReceiptModel) => {
      dispatch({ type: "SET_MODEL", payload: model });
    }, []),
    updateItem: useCallback((itemId: string, updates: Partial<ReceiptItem>) => {
      dispatch({ type: "UPDATE_ITEM", payload: { itemId, updates } });
    }, []),
    addItem: useCallback((item: ReceiptItem) => {
      dispatch({ type: "ADD_ITEM", payload: item });
    }, []),
    removeItem: useCallback((itemId: string) => {
      dispatch({ type: "REMOVE_ITEM", payload: itemId });
    }, []),
    updatePerson: useCallback((personId: string, updates: Partial<Person>) => {
      dispatch({ type: "UPDATE_PERSON", payload: { personId, updates } });
    }, []),
    addPerson: useCallback((person: Person) => {
      dispatch({ type: "ADD_PERSON", payload: person });
    }, []),
    removePerson: useCallback((personId: string) => {
      dispatch({ type: "REMOVE_PERSON", payload: personId });
    }, []),
    updateAllocation: useCallback((itemId: string, allocation: Allocation) => {
      dispatch({ type: "UPDATE_ALLOCATION", payload: { itemId, allocation } });
    }, []),
    updateFee: useCallback((index: number, fee: FeeModel) => {
      dispatch({ type: "UPDATE_FEE", payload: { index, fee } });
    }, []),
    addFee: useCallback((fee: FeeModel) => {
      dispatch({ type: "ADD_FEE", payload: fee });
    }, []),
    removeFee: useCallback((index: number) => {
      dispatch({ type: "REMOVE_FEE", payload: index });
    }, []),
    setRounding: useCallback((step: number, strategy: RoundingStrategy) => {
      dispatch({ type: "SET_ROUNDING", payload: { step, strategy } });
    }, []),
    setStep: useCallback((step: number) => {
      dispatch({ type: "SET_STEP", payload: step });
    }, []),
    validate: useCallback(() => {
      dispatch({ type: "VALIDATE" });
    }, []),
    calculate: useCallback(() => {
      dispatch({ type: "CALCULATE" });
    }, []),
    loadFromHistory: useCallback((model: ReceiptModel) => {
      dispatch({ type: "LOAD_FROM_HISTORY", payload: model });
    }, []),
    saveToHistory: useCallback(() => {
      dispatch({ type: "SAVE_TO_HISTORY" });
    }, []),
    reset: useCallback(() => {
      dispatch({ type: "RESET" });
    }, []),
    loadFromLocalStorage,
  };

  return (
    <TacuenContext.Provider value={{ state, dispatch, actions }}>
      {children}
    </TacuenContext.Provider>
  );
}

export function useTacuenStore() {
  const context = useContext(TacuenContext);
  if (context === undefined) {
    throw new Error("useTacuenStore must be used within a TacuenProvider");
  }
  return context;
}