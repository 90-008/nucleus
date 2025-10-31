{
  lib,
  stdenv,
  deno,
}:
stdenv.mkDerivation {
  name = "nucleus-modules";

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../deno.lock
      ../package.json
    ];
  };

  outputHash = "sha256-glfh3vNy9U0w7CjgFADAwb0qg/tzC0H97EY7zSjTgaQ=";
  outputHashAlgo = "sha256";
  outputHashMode = "recursive";

  nativeBuildInputs = [deno];

  dontConfigure = true;
  dontCheck = true;
  dontFixup = true;
  dontPatchShebangs = true;

  buildPhase = ''
    HOME=$TMPDIR deno install --frozen --seed 8008135
  '';
  installPhase = ''
    cp -R node_modules $out
    ls -la $out
  '';
}
