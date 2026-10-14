import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

// Regeneration must not discard the migration aliases or reset saved progress.
// A deliberate new content version starts its own progress identity.
export async function finalizeDefinition(definition, root) {
  try {
    const previous = JSON.parse(await readFile(new URL('composition.json', root)));
    if (previous.id === definition.id && previous.contentVersion === definition.contentVersion && previous.compatibility)
      definition.compatibility = previous.compatibility;
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  delete definition.contentHash;
  definition.contentHash = createHash('sha256').update(JSON.stringify(definition)).digest('hex');
  return definition;
}
