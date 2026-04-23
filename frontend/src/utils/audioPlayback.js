/**
 * URL the student player should load (backend may return stream, presigned, or legacy).
 */
export function getPlayableAudioUrl(questionOrRef) {
  if (!questionOrRef) return '';
  if (typeof questionOrRef === 'string') return questionOrRef;
  return questionOrRef.audio_presigned_url || questionOrRef.audio_url || '';
}

/** Stable key for answers/recordings; must match multipart field question_<key> after shuffle. */
export function examQuestionAnswerKey(question, index = 0) {
  if (!question) return String(index);
  const id = question.question_id ?? question._id;
  if (id !== undefined && id !== null && `${id}` !== '') return String(id);
  return String(index);
}
