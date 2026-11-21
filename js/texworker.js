// Atelier — fabrique les textures en arrière-plan
import { generate } from './texgen.js';
self.onmessage = e => {
  const { id, recipe } = e.data;
  const t = generate(recipe[0], recipe.slice(1));
  self.postMessage({ id, size: t.size, color: t.color, bump: t.bump }, [t.color.buffer, t.bump.buffer]);
};
