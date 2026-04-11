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
            pkgs.playwright-driver.browsers
            claude-code.packages.${system}.claude-code
          ];

          shellHook = ''
            export PLAYWRIGHT_BROWSERS_PATH=${pkgs.playwright-driver.browsers}
            export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
          '';
        };
      });
}
