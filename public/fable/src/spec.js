// The ticket, in one place. 1 unit is roughly 1 cm of card.
export const W = 9;            // width
export const H = 16.6;         // height
export const STUB = 4;         // stub height, measured up from the bottom edge
export const YP = -H / 2 + STUB; // y of the perforation line (sheet y runs up, origin at the centre)
export const RC = 0.42;        // corner radius
export const RN = 0.34;        // radius of the two die-cut notches where the perforation meets the edges
export const THICK = 0.075;    // card thickness (a bit heavier than real stock so the edge reads on screen)
export const N = 44;           // paper bridges ("teeth") along the perforation
export const PITCH = W / N;
export const MARGIN = 0.22;    // how far a tear may wander off the perforation line
export const S = 144;          // pixels per unit in the printed textures
