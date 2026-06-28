export function findMorphMesh(root) {
  const meshes = [];
  root.traverse((object) => {
    if (object.isMesh && object.morphTargetDictionary) {
      meshes.push(object);
    }
  });
  return meshes;
}
