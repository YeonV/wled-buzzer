export function emitLoopControl(socket, n) {
  socket.emit('loopControl', { n: n ?? null });
}

export function emitVideoControl(socket, url) {
  socket.emit('videoControl', { url: url ?? null });
}

export function emitJudgeCall(socket, winnerId, verdict, points, penalty) {
  const payload = { winnerId, verdict, points };
  if (penalty !== undefined) payload.penalty = penalty;
  socket.emit('judgeCall', payload);
}

export function emitJudgeAnswer(socket, winnerId, chosenIndex, correctIndex, points, penalty) {
  const payload = { winnerId, chosenIndex, correctIndex, points };
  if (penalty !== undefined) payload.penalty = penalty;
  socket.emit('judgeAnswer', payload);
}

export function emitSetQuestionIndex(socket, index, mode) {
  const payload = mode === undefined ? { index } : { index, mode };
  socket.emit('setQuestionIndex', payload);
}
