/**
 * The signed-in coordinator, as the coordinator screens need it.
 *
 * TEMPORARY: there is no coordinator login yet, so this is a fixed mock. It is
 * replaced by the real session when RF-S2.18 to RF-S2.21 land. When that
 * happens, only this file changes: the screens keep asking for the group name
 * and the initial.
 */

export type Coordinator = {
  /** Name of the group she coordinates, shown in the top menu. */
  groupName: string;
  /** First letter of her name, shown in the account circle. */
  initial: string;
};

const MOCK_COORDINATOR: Coordinator = {
  groupName: "Rendeiras do Código",
  initial: "K",
};

/**
 * The coordinator of the current session (mock for now). Async because the
 * real session will be read from the server, so callers already await it.
 */
export async function getCoordinator(): Promise<Coordinator> {
  return MOCK_COORDINATOR;
}
