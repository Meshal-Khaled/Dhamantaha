// Where the website lives on the internet (Cloudflare Tunnel hostname → port 3101 on The Ring).
// The QR code opens this address plus /teams, wherever the QR page is shown from, so a code made on a laptop or in
// development still leads to the real website. Leave it empty to use the address the page is opened on instead.
export const PUBLIC_SITE = 'https://web-dhamantaha.arc-homlab.com';

/** The path of the page made for the other teams. */
export const TEAMS_PATH = '/teams';
