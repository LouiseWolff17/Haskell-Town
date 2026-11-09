import type { Resident } from './types.ts';

// Everyone who lives in Haskell Town. Colours are used to draw them on the map.
export const RESIDENTS: Record<string, Resident> = {
  wren:  { name: 'Wren',  hair: '#7a4b2a', shirt: '#e9a23b', role: 'newcomer' },
  hazel: { name: 'Hazel', hair: '#b5452f', shirt: '#f4efe2', role: 'baker' },
  moss:  { name: 'Moss',  hair: '#a8a29a', shirt: '#6a994e', role: 'gardener' },
  bram:  { name: 'Bram',  hair: '#2f2a28', shirt: '#4a7fa7', role: 'shopkeeper' },
  iris:  { name: 'Iris',  hair: '#3c3a5a', shirt: '#8e6fb5', role: 'librarian' },
  juniper: { name: 'Juniper', hair: '#c98a3d', shirt: '#d1495b', role: 'teacher' },
  fern:  { name: 'Fern',  hair: '#5b3a29', shirt: '#2f6f73', role: 'mayor' },
  sorrel: { name: 'Dr. Sorrel', hair: '#e6dccb', shirt: '#5fa8a0', role: 'doctor' },
  pip:   { name: 'Pip',   hair: '#8a4b2a', shirt: '#2b3a67', role: 'conductor' },
  rowan: { name: 'Rowan', hair: '#d4a24c', shirt: '#7a9a3f', role: 'park keeper' },
  brine: { name: 'Captain Brine', hair: '#ececec', shirt: '#1f4e79', role: 'harbourmaster' },
  orla: { name: 'Orla', hair: '#2f2f45', shirt: '#5b4b8a', role: 'astronomer' },
  marigold: { name: 'Marigold', hair: '#e8a33d', shirt: '#c0587e', role: 'market trader' },
};
