cask "oss-browser" do
  arch arm: "arm64", intel: "x64"

  version "0.5.2"
  sha256 arm:   "282d68f2b0e242b5d044b4260cc790ba75625fc6069316691d5c1c488b07b3cf",
         intel: "8a7ba006938e8b1c85723e6bfe8fda8493ab9645ca28f9c2c8cf21ddbba21b68"

  url "https://github.com/yulin96/oss-browser/releases/download/v#{version}/oss-browser-#{version}-#{arch}.dmg",
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
        args: ["-dr", "com.apple.quarantine", "{{appdir}}/OSS Browser.app"],
        must_succeed: true
  end

  zap trash: "~/Library/Application Support/oss-browser"
end
