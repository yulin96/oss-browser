cask "oss-browser" do
  arch arm: "arm64", intel: "x64"

  version "0.5.15"
  sha256 arm: "efab6ceadda30df672ca829306019eb5dd4b19d1a6a15500ddef1b05800b79f8",
         intel: "5770ca7a2fb048fc547a2cac3daf94a4b9b35b820f515f3431c314fde5fcea32"

  url "https://github.com/yulin96/oss-browser/releases/download/v#{version}/oss-browser-#{version}-#{arch}.dmg"
  name "OSS Browser"
  desc "Independent desktop client for Alibaba Cloud OSS"
  homepage "https://github.com/yulin96/oss-browser"

  livecheck do
    url :url
    strategy :github_latest
  end

  app "OSS Browser.app"

  postflight_steps do
    run "/usr/bin/xattr",
        args: ["-dr", "com.apple.quarantine", "{{appdir}}/OSS Browser.app"]
  end

  zap trash: "~/Library/Application Support/oss-browser"
end
