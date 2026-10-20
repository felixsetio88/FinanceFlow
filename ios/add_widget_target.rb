#!/usr/bin/env ruby
# add_widget_target.rb
#
# Run this from the project root with:
#   cd ios && ruby add_widget_target.rb
#
# What it does:
#   1. Reads FinanceFlow.xcodeproj/project.pbxproj
#   2. Adds a new Widget Extension target (FinanceFlowWidget)
#   3. Adds the Swift source file, Info.plist, and entitlements
#   4. Adds the WidgetKit framework dependency
#   5. Links the widget extension to the main app target
#   6. Writes the modified pbxproj back

require 'xcodeproj'

PROJECT_PATH = "FinanceFlow.xcodeproj"
MAIN_TARGET_NAME = "FinanceFlow"
WIDGET_TARGET_NAME = "FinanceFlowWidget"
BUNDLE_IDENTIFIER = "com.financeflow.app.widget"
DEPLOYMENT_TARGET = "16.0"
WIDGET_DIR = "../ios/FinanceFlowWidget"

project = Xcodeproj::Project.open(PROJECT_PATH)

# Check if widget target already exists
existing = project.targets.find { |t| t.name == WIDGET_TARGET_NAME }
if existing
  puts "⚠️  Widget target '#{WIDGET_TARGET_NAME}' already exists. Skipping."
  exit 0
end

main_target = project.targets.find { |t| t.name == MAIN_TARGET_NAME }
unless main_target
  puts "❌ Could not find main target '#{MAIN_TARGET_NAME}'"
  exit 1
end

# Create the widget extension target
widget_target = project.new_target(
  :app_extension,
  WIDGET_TARGET_NAME,
  :ios,
  DEPLOYMENT_TARGET
)

widget_target.build_configurations.each do |config|
  config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = BUNDLE_IDENTIFIER
  config.build_settings['SWIFT_VERSION'] = '5.9'
  config.build_settings['INFOPLIST_FILE'] = "FinanceFlowWidget/Info.plist"
  config.build_settings['CODE_SIGN_ENTITLEMENTS'] = "FinanceFlowWidget/FinanceFlowWidget.entitlements"
  config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
  config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
  config.build_settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'NO'
  config.build_settings['SKIP_INSTALL'] = 'YES'
end

# Create a group for widget files
widget_group = project.main_group.find_subpath("FinanceFlowWidget", true)
widget_group.set_source_tree('<group>')
widget_group.set_path("FinanceFlowWidget")

# Add Swift source file
swift_file = widget_group.new_file("FinanceFlowWidget.swift")
swift_file.set_source_tree('<group>')
widget_target.source_build_phase.add_file_reference(swift_file)

# Add Info.plist (resources phase)
plist_file = widget_group.new_file("Info.plist")
plist_file.set_source_tree('<group>')

# Add entitlements
entitlements_file = widget_group.new_file("FinanceFlowWidget.entitlements")
entitlements_file.set_source_tree('<group>')

# Add WidgetKit framework
widgetkit_ref = project.frameworks_group.new_file('System/Library/Frameworks/WidgetKit.framework')
widgetkit_ref.set_source_tree('SDKROOT')
widget_target.frameworks_build_phase.add_file_reference(widgetkit_ref)

# Add SwiftUI framework
swiftui_ref = project.frameworks_group.new_file('System/Library/Frameworks/SwiftUI.framework')
swiftui_ref.set_source_tree('SDKROOT')
widget_target.frameworks_build_phase.add_file_reference(swiftui_ref)

# Add widget extension to main target's embed extensions build phase
embed_phase = main_target.build_phases.find { |p| p.is_a?(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase) && p.name == "Embed Foundation Extensions" }
unless embed_phase
  embed_phase = project.new(Xcodeproj::Project::Object::PBXCopyFilesBuildPhase)
  embed_phase.name = "Embed Foundation Extensions"
  embed_phase.symbol_dst_subfolder_spec = :plug_ins
  main_target.build_phases << embed_phase
end

widget_product = widget_target.product_reference
embed_file = embed_phase.add_file_reference(widget_product)
embed_file.settings = { 'ATTRIBUTES' => ['RemoveHeadersOnCopy'] }

# Add WidgetDataModule.swift and .m to the main app target
main_group = project.main_group.find_subpath("FinanceFlow", true)
wd_swift = main_group.new_file("WidgetDataModule.swift")
main_target.source_build_phase.add_file_reference(wd_swift)
wd_m = main_group.new_file("WidgetDataModule.m")
main_target.source_build_phase.add_file_reference(wd_m)

project.save

puts "✅ Widget Extension '#{WIDGET_TARGET_NAME}' added successfully!"
puts "   Bundle ID: #{BUNDLE_IDENTIFIER}"
puts ""
puts "Next steps:"
puts "  1. Open FinanceFlow.xcworkspace in Xcode"
puts "  2. Select the FinanceFlowWidget target"
puts "  3. Under Signing & Capabilities, set your team and enable App Groups"
puts "  4. Enable the same App Group on the main FinanceFlow target"
puts "  5. Build and run"
