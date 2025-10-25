/**
 * Log an event to the database
 */
export async function logEvent(db, rut, type, message) {
  try {
    await db.prepare(
      'INSERT INTO logs (rut, type, message) VALUES (?, ?, ?)'
    ).bind(rut, type, message).run();
  } catch (error) {
    console.error('Failed to log event:', error);
  }
}
