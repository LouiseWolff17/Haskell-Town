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

  enterShell = ''
    echo "Haskell-Town dev shell: node $(node --version)"
  '';
}
