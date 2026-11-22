cask "oss-browser" do
  arch arm: "arm64", intel: "x64"

  version "0.5.17"
  sha256 arm: "f39e5246b1829c528059f4ce0eaca9d8240ada87629c143617c407c10510899f",
         intel: "e5a0a6cbb498772b4b5643579e1eb578a10289d0e5d1e18c694620c9500b3194"

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
