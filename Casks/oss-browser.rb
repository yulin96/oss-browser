cask "oss-browser" do
  arch arm: "arm64", intel: "x64"

  version :latest
  sha256 :no_check

  url "https://github.com/yulin96/oss-browser/releases/latest/download/oss-browser-latest-#{arch}.dmg",
      verified: "github.com/yulin96/oss-browser/"
  name "OSS Browser"
  desc "Independent desktop client for Alibaba Cloud OSS"
  homepage "https://github.com/yulin96/oss-browser"

  livecheck do
    url :url
    strategy :github_latest
  end

  auto_updates true

  app "OSS Browser.app"

  postflight_steps do
    run "/usr/bin/xattr",
        args: ["-dr", "com.apple.quarantine", "{{appdir}}/OSS Browser.app"]
  end

  zap trash: "~/Library/Application Support/oss-browser"
end
