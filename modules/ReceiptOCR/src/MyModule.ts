import { NativeModule, requireNativeModule } from 'expo';

declare class MyModule extends NativeModule<{}> {}

export default requireNativeModule<MyModule>('MyModule');
