import * as qrcode from 'qrcode-terminal';

/**
 * Display a QR code linking to the session URL along with session info
 */
export function displaySessionQR(sseUrl: string, sessionId: string): void {
  const sessionUrl = `${sseUrl}/session/${sessionId}`;

  console.log('');
  console.log('┌─────────────────────────────────────┐');
  console.log('│     Remote Claude - Session Ready   │');
  console.log('└─────────────────────────────────────┘');
  console.log('');

  // Generate and display QR code (small mode for better terminal fit)
  qrcode.generate(sessionUrl, { small: true });

  console.log('');
  console.log(`Session URL: ${sessionUrl}`);
  console.log(`Session ID:  ${sessionId}`);
  console.log('');
  console.log('────────────────────────────────────────');
  console.log('');
}
