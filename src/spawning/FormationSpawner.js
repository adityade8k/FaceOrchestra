export class FormationSpawner {
  constructor({ recipes, spawnHonk }) {
    this.recipes = recipes;
    this.spawnHonk = spawnHonk;
  }

  spawn(recipeId, { parent = null } = {}) {
    const recipe = this.recipes.get?.(recipeId) || this.recipes[recipeId];
    if (!recipe) throw new Error(`Unknown formation recipe: ${recipeId}`);

    const honks = [];
    for (const [index, member] of recipe.members.entries()) {
      const honk = this.spawnHonk({
        tuning: member.tuning,
        name: `${recipe.namePrefix || recipe.id}_${member.tuning?.label || index + 1}_${index + 1}`,
      });
      if (!honk) continue;
      if (parent) parent.add(honk.root);
      applyArray(honk.root?.position, member.position, [0, 0, 0]);
      applyArray(honk.root?.quaternion, member.quaternion, [0, 0, 0, 1]);
      honks.push(honk);
    }
    return honks;
  }
}

function applyArray(target, values, fallback) {
  if (!target?.fromArray) return;
  target.fromArray(Array.isArray(values) ? values : fallback);
}
