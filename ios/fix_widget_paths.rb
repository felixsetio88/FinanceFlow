require 'xcodeproj'

project = Xcodeproj::Project.open("FinanceFlow.xcodeproj")

file_swift = project.files.find { |f| f.path == "WidgetDataModule.swift" || f.name == "WidgetDataModule.swift" }
if file_swift
  file_swift.path = "FinanceFlow/WidgetDataModule.swift"
  file_swift.name = "WidgetDataModule.swift"
  puts "Updated WidgetDataModule.swift path to FinanceFlow/WidgetDataModule.swift"
end

file_m = project.files.find { |f| f.path == "WidgetDataModule.m" || f.name == "WidgetDataModule.m" }
if file_m
  file_m.path = "FinanceFlow/WidgetDataModule.m"
  file_m.name = "WidgetDataModule.m"
  puts "Updated WidgetDataModule.m path to FinanceFlow/WidgetDataModule.m"
end

project.save
puts "Saved project.pbxproj"
