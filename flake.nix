{
  description = "Gamedev project";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixpkgs-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    claude-code.url = "github:sadjow/claude-code-nix";
  };

  outputs = { self, nixpkgs, flake-utils, claude-code }:
    flake-utils.lib.eachDefaultSystem (system:
      let
        pkgs = nixpkgs.legacyPackages.${system};
      in
      {
        devShells.default = pkgs.mkShell {
          buildInputs = [
            pkgs.nodejs
            pkgs.just
            pkgs.playwright-driver.browsers
            pkgs.libseccomp
            claude-code.packages.${system}.claude-code
          ];

          shellHook = ''
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

            if [ -z "$LD59_DEVSHELL" ] && [ -n "$SHELL" ] && [ -t 0 ] && [ -t 1 ]; then
              export LD59_DEVSHELL=1
              exec "$SHELL" -l
            fi
          '';
        };
      });
}
