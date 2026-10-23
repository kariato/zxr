// Adapted from rougeXR 820cb92500226f5e8817c9a4a452651d94a7609c.
// Copyright (c) 2026 Mark Davey. BSD-2-Clause; see ROUGEXR-LICENSE.txt.
/** Browser-local date/time makes automatic checkpoints recognizable in the saved-game list. */
export function checkpointStamp(date = new Date()): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
