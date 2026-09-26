// Repository/replay owner inventories shared resources once. Entity deletion
// must release only resources explicitly marked as belonging to that entity.
export function collectResources(root, resources = new Set()) {
  root?.traverse?.((node) => {
    if (node.geometry) resources.add(node.geometry);
    if (node.skeleton) resources.add(node.skeleton);
    for (const material of Array.isArray(node.material)
      ? node.material
      : node.material
        ? [node.material]
        : []) {
      resources.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) resources.add(value);
    }
  });
  return resources;
}
export function releaseResources(resources) {
  const images = new Set();
  for (const resource of resources) {
    if (resource.isTexture && resource.source?.data?.close)
      images.add(resource.source.data);
    resource.dispose?.();
  }
  for (const image of images) image.close();
  resources.clear();
}
