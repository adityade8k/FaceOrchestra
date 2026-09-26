import {
  mkdir,
  readFile,
  writeFile,
  link,
  copyFile,
  rename,
  unlink,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { join, dirname } from "node:path";

// Immutable hash objects, hard-linked into the existing portable take layout.
// Old archives and editor URLs remain valid; export streams regular file bytes.
export class SharedAssetStore {
  constructor(root) {
    this.root = root;
  }
  async snapshot(source, destination, expectedHash) {
    const bytes = await readFile(source),
      hash = createHash("sha256").update(bytes).digest("hex");
    if (expectedHash && expectedHash !== hash)
      throw new Error(
        "Asset changed after receiver startup; restart receiver before recording",
      );
    const object = join(this.root, hash);
    await mkdir(this.root, { recursive: true });
    const temporary = `${object}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: "wx", mode: 0o444 });
      try {
        await link(temporary, object);
      } catch (error) {
        if (error.code !== "EEXIST") throw error;
      }
    } finally {
      await unlink(temporary).catch(() => {});
    }
    await mkdir(dirname(destination), { recursive: true });
    try {
      await link(object, destination);
    } catch (error) {
      if (error.code === "EEXIST") return hash;
      if (!["EXDEV", "ENOTSUP", "EPERM"].includes(error.code)) throw error;
      const copy = `${destination}.tmp`;
      await copyFile(object, copy);
      await rename(copy, destination);
    }
    return hash;
  }
}
