import base from './playwright.config.mjs';
export default { ...base, testMatch: ['soloshots.spec.mjs', 'solomap.spec.mjs', 'partyshots.spec.mjs'] };
