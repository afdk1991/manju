package com.manju

import com.facebook.react.ReactActivity
import com.facebook.react.ReactActivityDelegate
import com.facebook.react.defaults.DefaultNewArchitectureEntryPoint.fabricEnabled
import com.facebook.react.defaults.DefaultReactActivityDelegate

/**
 * RN 主 Activity。getMainComponentName 返回的字符串必须与 app.json 的 name 一致（"Manju"）。
 */
class MainActivity : ReactActivity() {

    override fun getMainComponentName(): String = "Manju"

    override fun createReactActivityDelegate(): ReactActivityDelegate =
        DefaultReactActivityDelegate(this, mainComponentName, fabricEnabled)
}
