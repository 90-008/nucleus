{
  lib,
  stdenv,
  deno,
  nodejs,
  makeBinaryWrapper,
  nucleus-modules,
  PUBLIC_BASE_URL ? "http://localhost:5173",
}:
stdenv.mkDerivation {
  name = "nucleus";

  src = lib.fileset.toSource {
    root = ../.;
    fileset = lib.fileset.unions [
      ../src
      ../static
      ../deno.lock
      ../package.json
      ../svelte.config.js
      ../tsconfig.json
      ../vite.config.ts
    ];
  };

  nativeBuildInputs = [makeBinaryWrapper];
  buildInputs = [deno];

  inherit PUBLIC_BASE_URL;

  dontCheck = true;

  configurePhase = ''
    runHook preConfigure
    cp -R --no-preserve=ownership ${nucleus-modules} node_modules
    find node_modules -type d -exec chmod 755 {} \;
    substituteInPlace node_modules/.bin/vite \
      --replace-fail "/usr/bin/env node" "${nodejs}/bin/node"
    runHook postConfigure
  '';
  buildPhase = ''
    runHook preBuild
    HOME=$TMPDIR deno run --cached-only build
    runHook postBuild
  '';
  installPhase = ''
    runHook preInstall

    mkdir -p $out/bin
    cp -R ./build/* $out
    # cp -R ./node_modules $out

    runHook postInstall
  '';
}
