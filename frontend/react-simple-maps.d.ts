// Minimal ambient module declaration for react-simple-maps.
// The library ships no bundled TypeScript types and @types/react-simple-maps is
// unpublished, so we declare the components the WorldMap uses permissively.
// Pure ambient (no top-level import/export) so tsc always picks it up.
declare module "react-simple-maps" {
  const ComposableMap: React.ComponentType<Record<string, unknown> & { children?: React.ReactNode }>;
  const Geographies: React.ComponentType<{
    geography: string | Record<string, unknown>;
    children: (args: { geographies: unknown[] }) => React.ReactNode;
    [key: string]: unknown;
  }>;
  const Geography: React.ComponentType<{ geography: unknown; [key: string]: unknown }>;
  const Marker: React.ComponentType<Record<string, unknown> & { children?: React.ReactNode }>;
  const Line: React.ComponentType<Record<string, unknown>>;
  const ZoomableGroup: React.ComponentType<Record<string, unknown> & { children?: React.ReactNode }>;
  const Annotation: React.ComponentType<Record<string, unknown> & { children?: React.ReactNode }>;
  export {
    ComposableMap,
    Geographies,
    Geography,
    Marker,
    Line,
    ZoomableGroup,
    Annotation,
  };
}
