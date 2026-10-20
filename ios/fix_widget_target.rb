require 'xcodeproj'

project = Xcodeproj::Project.open("FinanceFlow.xcodeproj")
widget_target = project.targets.find { |t| t.name == "FinanceFlowWidget" }

if widget_target
  widget_target.build_configurations.each do |config|
    config.build_settings['PRODUCT_NAME'] = 'FinanceFlowWidget'
    config.build_settings['PRODUCT_MODULE_NAME'] = 'FinanceFlowWidget'
    config.build_settings['PRODUCT_BUNDLE_IDENTIFIER'] = 'com.financeflow.app.widget'
    config.build_settings['SWIFT_VERSION'] = '5.9'
    config.build_settings['INFOPLIST_FILE'] = "FinanceFlowWidget/Info.plist"
    config.build_settings['GENERATE_INFOPLIST_FILE'] = 'NO'
    config.build_settings['CODE_SIGN_ENTITLEMENTS'] = "FinanceFlowWidget/FinanceFlowWidget.entitlements"
    config.build_settings['LD_RUNPATH_SEARCH_PATHS'] = '$(inherited) @executable_path/Frameworks @executable_path/../../Frameworks'
    config.build_settings['TARGETED_DEVICE_FAMILY'] = '1,2'
    config.build_settings['ALWAYS_EMBED_SWIFT_STANDARD_LIBRARIES'] = 'NO'
    config.build_settings['SKIP_INSTALL'] = 'YES'
    config.build_settings['IPHONEOS_DEPLOYMENT_TARGET'] = '16.0'
    config.build_settings['ENABLE_USER_SCRIPT_SANDBOXING'] = 'NO'
  end

  if widget_target.product_reference
    widget_target.product_reference.name = 'FinanceFlowWidget.appex'
    widget_target.product_reference.path = 'FinanceFlowWidget.appex'
  end

  project.save
  puts "✅ Successfully updated FinanceFlowWidget target in project.pbxproj"
else
  puts "❌ FinanceFlowWidget target not found"
end
