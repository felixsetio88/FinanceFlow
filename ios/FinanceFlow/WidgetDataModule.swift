//
//  WidgetDataModule.swift
//  FinanceFlow
//
//  Native module that receives widget data from React Native
//  and writes it to the shared App Group UserDefaults so WidgetKit
//  widgets can read it.
//

import Foundation
import WidgetKit

@objc(WidgetDataModule)
class WidgetDataModule: NSObject {

    let APP_GROUP = "group.com.financeflow.app"
    let WIDGET_DATA_KEY = "financeflow_widget_data"

    @objc
    func updateWidgetData(_ json: String,
                          resolver resolve: @escaping RCTPromiseResolveBlock,
                          rejecter reject: @escaping RCTPromiseRejectBlock) {
        if let defaults = UserDefaults(suiteName: APP_GROUP) {
            defaults.set(json, forKey: WIDGET_DATA_KEY)
            defaults.synchronize()
            // Tell WidgetKit to reload all timelines
            if #available(iOS 14.0, *) {
                WidgetCenter.shared.reloadAllTimelines()
            }
            resolve(nil)
        } else {
            reject("WIDGET_ERROR", "Could not access App Group UserDefaults", nil)
        }
    }

    @objc
    static func requiresMainQueueSetup() -> Bool { false }
}
