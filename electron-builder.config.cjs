module.exports={
  appId:'io.github.larkagentbridge.desktop',productName:'Lark Agent Bridge',
  directories:{app:'desktop',output:'dist/desktop'},
  files:['main.cjs','preload.cjs','controller.cjs','ui/**','package.json'],
  extraResources:[{from:'.desktop-runtime',to:'bridge',filter:['**/*']}],
  artifactName:'Lark-Agent-Bridge-${version}-${os}-${arch}.${ext}',
  asar:true,
  win:{target:['nsis'],signAndEditExecutable:false},
  nsis:{oneClick:false,perMachine:false,allowToChangeInstallationDirectory:true,createDesktopShortcut:true,createStartMenuShortcut:true,deleteAppDataOnUninstall:false},
  mac:{target:['dmg','zip'],category:'public.app-category.productivity',identity:null},
  linux:{target:['AppImage','deb'],category:'Utility',maintainer:'Lark Agent Bridge contributors'},
  publish:null
};
