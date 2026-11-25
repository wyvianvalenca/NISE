/**
 * Dados de exemplo do card "Elas entraram na área?" (#370), no formato de
 * GET /coordinator/results/entered-field. A integração troca pela rota real.
 */
import type { EnteredStage } from "@/components/EnteredFieldCard";

export const ENTERED_FIELD_EXAMPLE: EnteredStage[] = [
  {
    stage: "fundamental",
    bars: [
      { months: 6, answered: 5, graduacao: 0, tecnico: 0, trying: 1, notYet: 4 },
      { months: 12, answered: 4, graduacao: 0, tecnico: 1, trying: 1, notYet: 2 },
      { months: 18, answered: 0, graduacao: 0, tecnico: 0, trying: 0, notYet: 0 },
    ],
  },
  {
    stage: "medio",
    bars: [
      { months: 6, answered: 20, graduacao: 1, tecnico: 3, trying: 6, notYet: 10 },
      { months: 12, answered: 14, graduacao: 2, tecnico: 4, trying: 4, notYet: 4 },
      { months: 18, answered: 1, graduacao: 1, tecnico: 0, trying: 0, notYet: 0 },
    ],
  },
  {
    stage: "tecnico_ou_graduacao",
    bars: [
      { months: 6, answered: 8, graduacao: 3, tecnico: 2, trying: 3, notYet: 0 },
      { months: 12, answered: 6, graduacao: 3, tecnico: 1, trying: 1, notYet: 1 },
      { months: 18, answered: 4, graduacao: 2, tecnico: 1, trying: 1, notYet: 0 },
    ],
  },
];
