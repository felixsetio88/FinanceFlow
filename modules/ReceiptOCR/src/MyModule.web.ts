import { registerWebModule, NativeModule } from 'expo';

class MyModule extends NativeModule<{}> {}

export default registerWebModule(MyModule, 'MyModule');
