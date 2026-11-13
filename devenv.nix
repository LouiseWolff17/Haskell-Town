{ pkgs, ... }:

{
  # Tools available in this project's shell (and to VS Code via direnv).
  packages = [ pkgs.git ];

  languages.javascript = {
    enable = true;
    package = pkgs.nodejs_22; # matches CI and package.json "engines"
    npm = {
      enable = true;
      install.enable = true; # runs npm install automatically when package.json changes
    };
  };

  # Browsers for the Playwright tests (npm run test:e2e). Nix builds them against its own
  # libraries, so they run without installing system packages. Keep @playwright/test in
  # package.json at the same version as pkgs.playwright-driver.
  env.PLAYWRIGHT_BROWSERS_PATH = "${pkgs.playwright-driver.browsers}";
  env.PLAYWRIGHT_SKIP_VALIDATE_HOST_REQUIREMENTS = "true";

  enterShell = ''
    echo "Haskell-Town dev shell: node $(node --version)"
  '';
}
