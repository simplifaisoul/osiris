export type SatelliteProgramKind = 'marker' | 'pick' | 'orbit';
type Shader = { variantName: string; vertexShaderPrelude: string; define?: string };

/** Bounded per-context shader cache; picking and orbit programs are demand-only. */
export function createSatelliteProgramCache<T>(
  compile: (kind: SatelliteProgramKind, prelude: string, define: string) => T,
  destroy: (program: T) => void,
  maxVariants = 4,
) {
  const variants = new Map<string, Map<SatelliteProgramKind, T>>();
  return {
    get(shader: Shader, kind: SatelliteProgramKind): T {
      const key = `${shader.variantName}\0${shader.define ?? ''}`;
      const programs = variants.get(key) ?? new Map<SatelliteProgramKind, T>();
      let program = programs.get(kind);
      if (!program) {
        program = compile(kind, shader.vertexShaderPrelude, shader.define ?? '');
        programs.set(kind, program);
      }
      variants.delete(key);
      variants.set(key, programs);
      while (variants.size > maxVariants) {
        const oldest = variants.keys().next().value!;
        variants.get(oldest)!.forEach(destroy);
        variants.delete(oldest);
      }
      return program;
    },
    clear() {
      variants.forEach(programs => programs.forEach(destroy));
      variants.clear();
    },
  };
}
