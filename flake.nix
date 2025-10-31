{
  inputs.parts.url = "github:hercules-ci/flake-parts";
  inputs.nixpkgs.url = "github:nixos/nixpkgs";
  inputs.naked-shell.url = "github:90-008/mk-naked-shell";

  outputs = inp:
    inp.parts.lib.mkFlake {inputs = inp;} {
      systems = ["x86_64-linux"];
      imports = [inp.naked-shell.flakeModule];
      perSystem = {
        config,
        system,
        ...
      }: let
        pkgs = inp.nixpkgs.legacyPackages.${system};
      in {
        devShells.default = config.mk-naked-shell.lib.mkNakedShell {
          name = "nucleus-devshell";
          packages = with pkgs; [
            nodejs-slim_latest deno biome
          ];
          shellHook = ''
            export PATH="$PATH:$PWD/node_modules/.bin"
          '';
        };
        packages.nucleus-modules = pkgs.callPackage ./nix/modules.nix {};
        packages.nucleus = pkgs.callPackage ./nix {
          inherit (config.packages) nucleus-modules;
        };
        packages.default = config.packages.nucleus;
    };
  };
}
