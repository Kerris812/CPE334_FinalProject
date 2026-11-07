/** The public API boundary: no identifiers, private timestamps or related records. */
export interface PublicBoardDto {
  queueCode: string;
  calledNumber: string | null;
  serviceState: 'CALLED' | 'SERVING' | null;
  waitingCount: number;
}
export function publicBoardDto(
  queue: { code: string },
  current: { displayNumber: string; status: string } | null,
  waitingCount: number,
): PublicBoardDto {
  const serviceState = current?.status === 'CALLED' ? 'CALLED' : current?.status === 'SERVING' ? 'SERVING' : null;
  // Build every field explicitly. Spreading a Prisma object would cross this boundary.
  return { queueCode: queue.code, calledNumber: serviceState === null ? null : current?.displayNumber ?? null, serviceState, waitingCount };
}
