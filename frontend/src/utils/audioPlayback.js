/**
 * URL the student player should load (backend may return stream, presigned, or legacy).
 */
export function getPlayableAudioUrl(questionOrRef) {
  if (!questionOrRef) return '';
  if (typeof questionOrRef === 'string') return questionOrRef;
  return questionOrRef.audio_presigned_url || questionOrRef.audio_url || '';
}
