#!/usr/bin/env node
/**
 * wxmini-ci - 微信小程序 CI 工具
 * 支持：check, preview, upload, build-npm, upload-function, upload-storage, get-sourcemap
 * 
 * 使用方式：
 *   node wxmini-ci.js <command> [options]
 *   node wxmini-ci.js --help
 */

const fs = require('fs');
const path = require('path');
const os = require('os');

// ============== 版本 ==============
const VERSION = '1.0.0';

// ============== 配置 ==============
const CONFIG_FILES = [
  'wxmini-ci.config.js',
  '.wxmini-ci.config.js',
  path.join(os.homedir(), '.wxmini-ci.config.js')
];

// 默认输出目录
function getDefaultOutputDir() {
  return path.join(os.tmpdir(), 'wxmini-ci');
}

// 默认配置
let config = {
  appid: '',
  privateKeyPath: '',
  projectPath: '',
  type: 'miniProgram',
  outputDir: getDefaultOutputDir(),
  setting: {}
};

// ============== 工具函数 ==============
function log(msg, type = 'info') {
  const prefix = {
    info: 'ℹ️',
    success: '✅',
    error: '❌',
    warn: '⚠️'
  };
  console.log(`${prefix[type] || 'ℹ️'} ${msg}`);
}

function loadEnvConfig() {
  // 环境变量优先级最高
  const envMapping = {
    'WXMINI_APPID': 'appid',
    'WXMINI_PRIVATE_KEY': 'privateKey',
    'WXMINI_PRIVATE_KEY_PATH': 'privateKeyPath',
    'WXMINI_PROJECT_PATH': 'projectPath',
    'WXMINI_TYPE': 'type',
    'WXMINI_OUTPUT_DIR': 'outputDir'
  };
  
  for (const [envKey, configKey] of Object.entries(envMapping)) {
    const value = process.env[envKey];
    if (value) {
      config[configKey] = value;
    }
  }
  
  // 如果从环境变量加载了任何配置，输出提示
  const loadedFromEnv = Object.entries(envMapping).some(([envKey]) => process.env[envKey]);
  if (loadedFromEnv) {
    log('已从环境变量加载配置', 'info');
  }
}

function loadConfig() {
  // 先加载环境变量（最高优先级）
  loadEnvConfig();
  
  // 再加载配置文件
  for (const configFile of CONFIG_FILES) {
    const fullPath = path.resolve(configFile.replace('~', os.homedir()));
    if (fs.existsSync(fullPath)) {
      try {
        const fileConfig = require(fullPath);
        config = { ...config, ...fileConfig };
        // 确保 outputDir 有默认值
        if (!config.outputDir) {
          config.outputDir = getDefaultOutputDir();
        }
        log(`已加载配置文件: ${fullPath}`, 'success');
        return true;
      } catch (e) {
        log(`配置文件加载失败: ${e.message}`, 'error');
        return false;
      }
    }
  }
  return false;
}

// 从 projects 映射中解析最终配置
function resolveProjectConfig(projectName) {
  // 如果没有 projects 映射，直接返回当前配置
  if (!config.projects) {
    return config;
  }
  
  const projects = config.projects;
  
  // 确定要使用的项目名
  let targetProject = projectName;
  if (!targetProject) {
    // 优先使用 config.default
    targetProject = config.default || Object.keys(projects)[0];
  }
  
  if (!targetProject || !projects[targetProject]) {
    log(`未找到项目配置: ${projectName || targetProject}`, 'error');
    log(`可用项目: ${Object.keys(projects).join(', ')}`, 'info');
    return null;
  }
  
  const projectConfig = projects[targetProject];
  log(`使用项目配置: ${targetProject}`, 'info');
  
  // 合并配置：顶层配置 + 项目配置（项目配置优先）
  return {
    ...config,
    ...projectConfig,
    // 保留 projects 映射（用于下次解析）
    projects: config.projects
  };
}

function checkMiniprogramCiInstalled(projectPath) {
  const pkgPath = path.join(projectPath, 'node_modules', 'miniprogram-ci');
  if (!fs.existsSync(pkgPath)) {
    log('miniprogram-ci 未安装', 'error');
    log(`请在项目目录执行: cd ${projectPath} && npm install miniprogram-ci`, 'warn');
    return false;
  }
  return true;
}

function checkPrivateKey(privateKeyPath) {
  if (!privateKeyPath) {
    log('私钥路径未配置', 'error');
    return false;
  }
  const fullPath = path.resolve(privateKeyPath.replace('~', os.homedir()));
  if (!fs.existsSync(fullPath)) {
    log(`私钥文件不存在: ${fullPath}`, 'error');
    return false;
  }
  return true;
}

function checkProjectPath(projectPath) {
  if (!projectPath) {
    log('项目路径未配置', 'error');
    return false;
  }
  const fullPath = path.resolve(projectPath.replace('~', os.homedir()));
  if (!fs.existsSync(fullPath)) {
    log(`项目目录不存在: ${fullPath}`, 'error');
    return false;
  }
  
  const configPath = path.join(fullPath, 'project.config.json');
  if (!fs.existsSync(configPath)) {
    log(`project.config.json 不存在: ${configPath}`, 'warn');
  }
  return true;
}

function parseValue(val) {
  if (val === 'true') return true;
  if (val === 'false') return false;
  if (!isNaN(val) && val !== '') return Number(val);
  return val;
}

function parseArgs(rawArgs) {
  const options = {};
  const setting = {};
  
  for (let i = 0; i < rawArgs.length; i++) {
    const arg = rawArgs[i];
    
    // 处理 --setting.key value 格式
    if (arg.startsWith('--setting.')) {
      const key = arg.replace('--setting.', '');
      const value = rawArgs[i + 1];
      if (value && !value.startsWith('--')) {
        setting[key] = parseValue(value);
        i++;
      } else {
        setting[key] = true;
      }
      continue;
    }
    
    // 处理 --set key=value 或 --set key value 格式
    if (arg === '--set') {
      // 先检查是否是 key=value 格式
      const nextArg = rawArgs[i + 1];
      if (nextArg && nextArg.includes('=')) {
        // --set key=value 格式
        options['set'] = nextArg;
        i++;
      } else {
        // --set key value 格式
        const key = rawArgs[i + 1];
        const value = rawArgs[i + 2];
        if (key && value && !value.startsWith('--')) {
          options['set'] = `${key}=${value}`;
          i += 2;
        } else {
          options['set'] = true;
          i++;
        }
      }
      continue;
    }
    
    // 处理 --get key 格式
    if (arg === '--get') {
      const key = rawArgs[i + 1];
      if (key && !key.startsWith('--')) {
        options['get'] = key;
        i++;
      }
      // 如果没有key参数，options['get']保持undefined
      continue;
    }
    
    // 处理 --project <name> 格式
    if (arg === '--project') {
      const name = rawArgs[i + 1];
      if (name && !name.startsWith('--')) {
        options['project'] = name;
        i++;
      }
      continue;
    }
    
    // 处理 --list 格式
    if (arg === '--list') {
      options['list'] = true;
      continue;
    }
    
    // 处理 --robot 30 格式
    if (arg.startsWith('--') && !arg.includes('.')) {
      const key = arg.slice(2).replace(/-([a-z])/g, (_, c) => c.toUpperCase());
      const value = rawArgs[i + 1];
      if (value !== undefined && !value.startsWith('--')) {
        options[key] = parseValue(value);
        i++;
      } else {
        options[key] = true;
      }
    }
  }
  
  if (Object.keys(setting).length > 0) {
    options.setting = setting;
  }
  
  return options;
}

function getProjectObject(options) {
  return {
    appid: options.appid || config.appid,
    type: options.type || config.type,
    projectPath: (options.projectPath || config.projectPath).replace('~', os.homedir()),
    privateKeyPath: (options.privateKeyPath || options.privateKey || config.privateKeyPath).replace('~', os.homedir())
  };
}

function validateRobot(robot) {
  const num = parseInt(robot, 10);
  if (isNaN(num) || num < 1 || num > 30) {
    log(`robot 值无效: ${robot}，应为 1-30`, 'warn');
    return false;
  }
  return true;
}

function ensureDir(dirPath) {
  const fullPath = path.resolve(dirPath.replace('~', os.homedir()));
  if (!fs.existsSync(fullPath)) {
    fs.mkdirSync(fullPath, { recursive: true });
    log(`已创建目录: ${fullPath}`, 'info');
  }
  return fullPath;
}

function mergeSetting(options) {
  return {
    es6: true,
    ...config.setting,
    ...(options.setting || {})
  };
}

// ============== 命令实现 ==============

async function cmdInit(options) {
  log(`=== 环境初始化 (v${VERSION}) ===`, 'info');
  
  const projectPath = (options.projectPath || config.projectPath || '').replace('~', os.homedir());
  
  if (!projectPath) {
    log('未指定项目路径，使用 --project-path 或配置文件', 'error');
    return false;
  }
  
  if (!fs.existsSync(projectPath)) {
    log(`项目目录不存在: ${projectPath}`, 'error');
    return false;
  }
  
  // 检查并安装 miniprogram-ci
  const pkgPath = path.join(projectPath, 'node_modules', 'miniprogram-ci');
  if (fs.existsSync(pkgPath)) {
    log('miniprogram-ci 已安装', 'success');
  } else {
    log('正在安装 miniprogram-ci...', 'info');
    try {
      const { execSync } = require('child_process');
      execSync('npm install miniprogram-ci', {
        cwd: projectPath,
        stdio: 'inherit'
      });
      log('miniprogram-ci 安装完成', 'success');
    } catch (e) {
      log(`安装失败: ${e.message}`, 'error');
      return false;
    }
  }
  
  // 检查输出目录
  const outputDir = options.outputDir || config.outputDir || getDefaultOutputDir();
  ensureDir(outputDir);
  log(`输出目录: ${outputDir}`, 'info');
  
  log('初始化完成', 'success');
  return true;
}

async function cmdConfig(options) {
  const projectName = options.project;
  
  // 显示当前配置
  if (!options.get && !options.set && !options.list) {
    log('=== 当前配置 ===', 'info');
    log(`默认项目: ${config.default || '未设置'}`, 'info');
    
    if (config.projects) {
      log('可用项目:', 'info');
      for (const [name, proj] of Object.entries(config.projects)) {
        const marker = name === config.default ? ' [默认]' : '';
        log(`  ${name}${marker}`, 'info');
        log(`    appid: ${proj.appid || '未设置'}`, 'info');
        log(`    privateKeyPath: ${proj.privateKeyPath || '未设置'}`, 'info');
        log(`    projectPath: ${proj.projectPath || '未设置'}`, 'info');
      }
    } else {
      log(`AppID: ${config.appid || '未设置'}`, 'info');
      log(`项目路径: ${config.projectPath || '未设置'}`, 'info');
      log(`类型: ${config.type || 'miniProgram'}`, 'info');
    }
    
    log(`输出目录: ${config.outputDir || getDefaultOutputDir()}`, 'info');
    log('', 'info');
    log('用法:', 'info');
    log('  config --list                      列出所有项目', 'info');
    log('  config --project <名> --set k=v    设置项目配置（临时）', 'info');
    log('  config --project <名> --get <key>   获取项目配置', 'info');
    log('', 'info');
    log('注意: --set 为临时配置，退出后失效。如需持久化，请使用配置文件', 'info');
    return true;
  }
  
  // 列出所有项目
  if (options.list) {
    log('=== 项目列表 ===', 'info');
    if (!config.projects || Object.keys(config.projects).length === 0) {
      log('暂无配置项目', 'info');
    } else {
      for (const [name, proj] of Object.entries(config.projects)) {
        const marker = name === config.default ? ' [默认]' : '';
        log(`  ${name}${marker}`, 'info');
        log(`    appid: ${proj.appid || '未设置'}`, 'info');
        log(`    privateKeyPath: ${proj.privateKeyPath || '未设置'}`, 'info');
        log(`    projectPath: ${proj.projectPath || '未设置'}`, 'info');
        log(`    type: ${proj.type || 'miniProgram'}`, 'info');
      }
    }
    return true;
  }
  
  // 获取配置项
  if (options.get !== undefined) {
    const key = options.get;
    if (!key) {
      log('用法: config --get <key>', 'error');
      return false;
    }
    
    let value;
    if (projectName && config.projects && config.projects[projectName]) {
      // 从指定项目获取
      value = config.projects[projectName][key];
      log(`[${projectName}] ${key} = ${JSON.stringify(value)}`, 'success');
    } else {
      // 从全局配置获取
      value = config[key];
      log(`${key} = ${JSON.stringify(value)}`, 'success');
    }
    return true;
  }
  
  // 设置配置项
  if (options.set && typeof options.set === 'string') {
    const setStr = options.set;
    const eqIndex = setStr.indexOf('=');
    if (eqIndex === -1) {
      log('用法: config --set <key>=<value>', 'error');
      return false;
    }
    
    const key = setStr.substring(0, eqIndex);
    const value = setStr.substring(eqIndex + 1);
    
    // 尝试解析为 JSON
    let parsedValue = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {}
    
    if (projectName) {
      // 设置指定项目的配置
      if (!config.projects) {
        config.projects = {};
      }
      if (!config.projects[projectName]) {
        config.projects[projectName] = {};
      }
      config.projects[projectName][key] = parsedValue;
      log(`[${projectName}] 已设置 ${key} = ${JSON.stringify(parsedValue)}`, 'success');
    } else {
      // 设置全局配置
      config[key] = parsedValue;
      log(`已设置 ${key} = ${JSON.stringify(parsedValue)}`, 'success');
    }
    return true;
  }
  
  log('用法: config [--project <名>] [--get <key>] [--set <key>=<value>]', 'info');
  return true;
}

async function cmdCheck(options) {
  log(`=== 配置检查 (v${VERSION}) ===`, 'info');
  
  const projectPath = (options.projectPath || config.projectPath || '').replace('~', os.homedir());
  const privateKeyPath = (options.privateKeyPath || options.privateKey || config.privateKeyPath || '').replace('~', os.homedir());
  const appid = options.appid || config.appid;
  
  let allOk = true;
  
  // 检查 appid
  if (appid) {
    log(`AppID: ${appid}`, 'success');
  } else {
    log('AppID: 未配置', 'warn');
    allOk = false;
  }
  
  // 检查私钥
  if (privateKeyPath) {
    if (checkPrivateKey(privateKeyPath)) {
      log('私钥: 验证通过', 'success');
    } else {
      allOk = false;
    }
  } else {
    log('私钥: 未配置', 'warn');
    allOk = false;
  }
  
  // 检查项目目录
  if (projectPath) {
    if (checkProjectPath(projectPath)) {
      log(`项目: ${projectPath}`, 'success');
    } else {
      allOk = false;
    }
  } else {
    log('项目路径: 未配置', 'warn');
    allOk = false;
  }
  
  // 检查输出目录
  const outputDir = options.outputDir || config.outputDir || getDefaultOutputDir();
  log(`输出目录: ${outputDir}`, 'info');
  
  if (allOk) {
    log('配置检查通过', 'success');
  } else {
    log('配置检查未通过，请补充必要参数', 'error');
    log('', 'info');
    log('必要数据:', 'warn');
    log('  --appid         小程序 appid', 'warn');
    log('  --private-key   私钥文件路径', 'warn');
    log('  --project-path  项目路径', 'warn');
    log('', 'info');
    log('使用 init 命令安装依赖', 'info');
  }
  
  return allOk;
}

async function cmdPreview(options) {
  const miniprogramCi = require('miniprogram-ci');
  
  const projectPath = (options.projectPath || config.projectPath).replace('~', os.homedir());
  const privateKeyPath = (options.privateKeyPath || options.privateKey || config.privateKeyPath).replace('~', os.homedir());
  const appid = options.appid || config.appid;
  
  if (!appid) {
    log('缺少必要参数: appid', 'error');
    return false;
  }
  
  if (!checkPrivateKey(privateKeyPath) || !checkProjectPath(projectPath)) {
    return false;
  }
  
  if (!checkMiniprogramCiInstalled(projectPath)) {
    return false;
  }
  
  const project = new miniprogramCi.Project({
    appid,
    type: options.type || config.type,
    projectPath,
    privateKeyPath
  });
  
  const qrcodeFormat = options.qrcodeFormat || 'terminal';
  const outputDir = path.resolve((options.outputDir || config.outputDir || getDefaultOutputDir()).replace('~', os.homedir()));
  ensureDir(outputDir);
  
  const qrcodeOutput = path.join(outputDir, `preview-${Date.now()}.png`);
  const version = options.version;
  const desc = options.desc || `预览 ${new Date().toLocaleString()}`;
  
  log(`=== 预览 ===`);
  log(`版本: ${version}`);
  log(`描述: ${desc}`);
  log(`输出: ${qrcodeOutput}`);
  
  if (options.robot && !validateRobot(options.robot)) {
    return false;
  }
  
  try {
    const result = await miniprogramCi.preview({
      project,
      desc,
      setting: mergeSetting(options),
      version,
      qrcodeFormat,
      qrcodeOutputDest: qrcodeOutput,
      pagePath: options.pagePath,
      searchQuery: options.searchQuery,
      scene: options.scene || 1011,
      robot: options.robot || 1
    });
    
    log(`包信息:`, 'success');
    if (result.subPackageInfo) {
      result.subPackageInfo.forEach(pkg => {
        log(`  ${pkg.name}: ${(pkg.size / 1024).toFixed(2)} KB`);
      });
    }
    
    if (qrcodeFormat === 'terminal') {
      log(`预览完成，请在终端扫描二维码`, 'success');
    } else {
      log(`二维码已保存: ${qrcodeOutput}`, 'success');
    }
    
    return true;
  } catch (e) {
    log(`预览失败: ${e.message}`, 'error');
    return false;
  }
}

async function cmdUpload(options) {
  const miniprogramCi = require('miniprogram-ci');
  
  const projectPath = (options.projectPath || config.projectPath).replace('~', os.homedir());
  const privateKeyPath = (options.privateKeyPath || options.privateKey || config.privateKeyPath).replace('~', os.homedir());
  const appid = options.appid || config.appid;
  const version = options.version;
  const desc = options.desc || `上传 ${new Date().toLocaleString()}`;
  
  if (!appid) {
    log('缺少必要参数: appid', 'error');
    return false;
  }
  if (!version) {
    log('缺少必要参数: version', 'error');
    return false;
  }
  if (!checkPrivateKey(privateKeyPath) || !checkProjectPath(projectPath)) {
    return false;
  }
  if (!checkMiniprogramCiInstalled(projectPath)) {
    return false;
  }
  
  const project = new miniprogramCi.Project({
    appid,
    type: options.type || config.type,
    projectPath,
    privateKeyPath
  });
  
  log(`=== 上传 ===`);
  log(`版本: ${version}`);
  log(`描述: ${desc}`);
  
  if (options.robot && !validateRobot(options.robot)) {
    return false;
  }
  
  try {
    const result = await miniprogramCi.upload({
      project,
      version,
      desc,
      setting: mergeSetting(options),
      robot: options.robot || 1,
      threads: options.threads || 1
    });
    
    log(`上传成功!`, 'success');
    if (result.subPackageInfo) {
      log(`包信息:`, 'success');
      result.subPackageInfo.forEach(pkg => {
        log(`  ${pkg.name}: ${(pkg.size / 1024).toFixed(2)} KB`);
      });
    }
    if (result.pluginInfo) {
      log(`插件信息:`, 'info');
      result.pluginInfo.forEach(p => {
        log(`  ${p.pluginProviderAppid}: ${p.version} (${(p.size / 1024).toFixed(2)} KB)`);
      });
    }
    
    return true;
  } catch (e) {
    log(`上传失败: ${e.message}`, 'error');
    return false;
  }
}

async function cmdBuildNpm(options) {
  const miniprogramCi = require('miniprogram-ci');
  
  const projectPath = (options.projectPath || config.projectPath).replace('~', os.homedir());
  const privateKeyPath = (options.privateKeyPath || options.privateKey || config.privateKeyPath).replace('~', os.homedir());
  const appid = options.appid || config.appid;
  
  if (!appid) {
    log('缺少必要参数: appid', 'error');
    return false;
  }
  
  if (!checkPrivateKey(privateKeyPath) || !checkProjectPath(projectPath)) {
    return false;
  }
  
  if (!checkMiniprogramCiInstalled(projectPath)) {
    return false;
  }
  
  const project = new miniprogramCi.Project({
    appid,
    type: options.type || config.type,
    projectPath,
    privateKeyPath
  });
  
  log(`=== 构建 NPM ===`);
  
  try {
    await miniprogramCi.buildNpm({
      project,
      ignores: options.ignores,
      reporter: (info) => {
        if (info.type === 'error') {
          log(`错误: ${info.message}`, 'error');
        } else if (info.type === 'warn') {
          log(`警告: ${info.message}`, 'warn');
        } else {
          log(info.message);
        }
      }
    });
    
    log(`NPM 构建完成`, 'success');
    return true;
  } catch (e) {
    log(`构建失败: ${e.message}`, 'error');
    return false;
  }
}

async function cmdUploadFunction(options) {
  const miniprogramCi = require('miniprogram-ci');
  
  const projectPath = (options.projectPath || config.projectPath).replace('~', os.homedir());
  const privateKeyPath = (options.privateKeyPath || options.privateKey || config.privateKeyPath).replace('~', os.homedir());
  const appid = options.appid || config.appid;
  
  const env = options.env;
  const name = options.name;
  const funcPath = options.path;
  
  if (!appid) {
    log('缺少必要参数: appid', 'error');
    return false;
  }
  if (!env || !name || !funcPath) {
    log('缺少必要参数: env, name, path', 'error');
    return false;
  }
  
  if (!checkPrivateKey(privateKeyPath) || !checkProjectPath(projectPath)) {
    return false;
  }
  
  if (!checkMiniprogramCiInstalled(projectPath)) {
    return false;
  }
  
  log(`⚠️ 注意: 云函数上传可能需要 miniprogram-ci@alpha 版本`, 'warn');
  
  const project = new miniprogramCi.Project({
    appid,
    type: options.type || config.type,
    projectPath,
    privateKeyPath
  });
  
  log(`=== 上传云函数 ===`);
  log(`环境: ${env}`);
  log(`函数: ${name}`);
  log(`路径: ${funcPath}`);
  
  try {
    await miniprogramCi.uploadCloudFunction({
      project,
      env,
      name,
      path: funcPath,
      remoteNpmInstall: options.remoteNpmInstall || false
    });
    
    log(`云函数上传成功: ${name}`, 'success');
    return true;
  } catch (e) {
    log(`上传失败: ${e.message}`, 'error');
    return false;
  }
}

async function cmdUploadStorage(options) {
  const miniprogramCi = require('miniprogram-ci');
  
  const projectPath = (options.projectPath || config.projectPath).replace('~', os.homedir());
  const privateKeyPath = (options.privateKeyPath || options.privateKey || config.privateKeyPath).replace('~', os.homedir());
  const appid = options.appid || config.appid;
  
  const env = options.env;
  const storagePath = options.path;
  
  if (!appid) {
    log('缺少必要参数: appid', 'error');
    return false;
  }
  if (!env || !storagePath) {
    log('缺少必要参数: env, path', 'error');
    return false;
  }
  
  if (!checkPrivateKey(privateKeyPath) || !checkProjectPath(projectPath)) {
    return false;
  }
  
  if (!checkMiniprogramCiInstalled(projectPath)) {
    return false;
  }
  
  log(`⚠️ 注意: 云存储上传需要 miniprogram-ci@alpha 版本`, 'warn');
  
  const project = new miniprogramCi.Project({
    appid,
    type: options.type || config.type,
    projectPath,
    privateKeyPath
  });
  
  log(`=== 上传云存储 ===`);
  log(`环境: ${env}`);
  log(`本地路径: ${storagePath}`);
  if (options.remotePath) {
    log(`远端路径: ${options.remotePath}`);
  }
  
  try {
    await miniprogramCi.uploadCloudStorage({
      project,
      env,
      path: storagePath,
      remotePath: options.remotePath
    });
    
    log(`云存储上传成功`, 'success');
    return true;
  } catch (e) {
    log(`上传失败: ${e.message}`, 'error');
    return false;
  }
}

async function cmdGetSourcemap(options) {
  const miniprogramCi = require('miniprogram-ci');
  
  const projectPath = (options.projectPath || config.projectPath).replace('~', os.homedir());
  const privateKeyPath = (options.privateKeyPath || options.privateKey || config.privateKeyPath).replace('~', os.homedir());
  const appid = options.appid || config.appid;
  
  const robot = options.robot;
  const output = options.output;
  
  if (!appid) {
    log('缺少必要参数: appid', 'error');
    return false;
  }
  if (!robot) {
    log('缺少必要参数: robot', 'error');
    return false;
  }
  if (!output) {
    log('缺少必要参数: output', 'error');
    return false;
  }
  
  if (!checkPrivateKey(privateKeyPath) || !checkProjectPath(projectPath)) {
    return false;
  }
  
  if (!checkMiniprogramCiInstalled(projectPath)) {
    return false;
  }
  
  if (!validateRobot(robot)) {
    return false;
  }
  
  const project = new miniprogramCi.Project({
    appid,
    type: options.type || config.type,
    projectPath,
    privateKeyPath
  });
  
  const outputDir = path.resolve(output.replace('~', os.homedir()));
  ensureDir(outputDir);
  
  log(`=== 获取 SourceMap ===`);
  log(`机器人: ${robot}`);
  log(`输出路径: ${outputDir}`);
  
  try {
    await miniprogramCi.getDevSourceMap({
      project,
      robot: parseInt(robot, 10),
      sourceMapSavePath: outputDir
    });
    
    log(`SourceMap 已保存: ${outputDir}`, 'success');
    return true;
  } catch (e) {
    log(`获取失败: ${e.message}`, 'error');
    return false;
  }
}

// ============== 主程序 ==============

function printHelp() {
  console.log(`
wxmini-ci v${VERSION} - 微信小程序 CI 工具
=====================================

使用方法:
  node wxmini-ci.js <command> [options]

命令:
  init            初始化环境（安装依赖）
  config          查看/修改配置
  check           检查配置是否完整
  preview         预览（生成二维码）
  upload          上传代码
  build-npm       构建 npm
  upload-function 上传云函数
  upload-storage  上传云存储
  get-sourcemap   获取 SourceMap

全局选项:
  --project        从配置文件 projects 映射中选择项目
  --appid          小程序 appid
  --private-key    私钥文件路径
  --project-path   项目路径
  --type           项目类型 (miniProgram/miniGame/miniProgramPlugin/miniGamePlugin)
  --output-dir     输出目录 (默认: 系统临时目录下的 wxmini-ci 子目录)

preview 特有选项:
  --version          版本号 (默认 1.0.0)
  --desc             描述
  --qrcode-format    二维码格式: terminal/base64/image (默认 terminal)
  --qrcode-output    二维码输出路径 (默认 {output-dir}/preview-{timestamp}.png)
  --page-path        预览页面路径
  --search-query     启动参数
  --scene            场景值 (默认 1011)
  --robot            CI 机器人 1-30

upload 特有选项:
  --version          版本号 (必填)
  --desc             描述
  --robot            CI 机器人 1-30
  --threads          编译线程数
  --setting.<key>    编译设置 (如 --setting.es6 true --setting.minify true)

build-npm 特有选项:
  --ignores          排除规则

upload-function 特有选项:
  --env              云环境 ID (必填)
  --name             云函数名称 (必填)
  --path             云函数目录 (必填)
  --remote-npm-install  云端安装依赖

upload-storage 特有选项:
  --env              云环境 ID (必填)
  --path             本地目录 (必填)
  --remote-path       远端路径

get-sourcemap 特有选项:
  --robot            CI 机器人 (必填)
  --output           输出路径 (必填)

配置文件:
  支持 wxmini-ci.config.js 配置文件，自动加载
  配置文件的 outputDir: 默认使用系统临时目录下的 wxmini-ci 子目录

示例:
  # 检查环境
  node wxmini-ci.js check --appid wx7xxx --private-key ./key.pem --project-path ./

  # 预览
  node wxmini-ci.js preview --appid wx7xxx --project-path ./ -v 1.0.0

  # 上传
  node wxmini-ci.js upload --appid wx7xxx --project-path ./ -v 1.0.1 --desc "修复bug"

  # 自定义输出目录
  node wxmini-ci.js preview --appid wx7xxx --project-path ./ --output-dir ~/my-wxmini-output

  # 使用多项目配置
  node wxmini-ci.js upload --project my-app --version 1.0.0
  `);
}

async function main() {
  const args = process.argv.slice(2);
  
  if (args.length === 0 || args[0] === '--help' || args[0] === '-h') {
    printHelp();
    return;
  }
  
  const command = args[0];
  
  // 加载配置（环境变量 + 配置文件）
  loadConfig();
  
  // 解析选项
  const options = parseArgs(args.slice(1));
  
  // 如果指定了 --project，从 projects 映射中解析配置
  if (options.project && config.projects) {
    const resolved = resolveProjectConfig(options.project);
    if (!resolved) {
      process.exit(1);
    }
    // 更新全局 config
    Object.assign(config, resolved);
  } else if (config.projects && !options.project) {
    // 没有指定 --project 但有 projects 配置，使用 default 或第一个
    const resolved = resolveProjectConfig(null);
    if (resolved) {
      Object.assign(config, resolved);
    }
  }
  
  let result = false;
  
  switch (command) {
    case 'init':
      result = await cmdInit(options);
      break;
    case 'config':
      result = await cmdConfig(options);
      break;
    case 'check':
      result = await cmdCheck(options);
      break;
    case 'preview':
      result = await cmdPreview(options);
      break;
    case 'upload':
      result = await cmdUpload(options);
      break;
    case 'build-npm':
      result = await cmdBuildNpm(options);
      break;
    case 'upload-function':
      result = await cmdUploadFunction(options);
      break;
    case 'upload-storage':
      result = await cmdUploadStorage(options);
      break;
    case 'get-sourcemap':
      result = await cmdGetSourcemap(options);
      break;
    default:
      log(`未知命令: ${command}`, 'error');
      printHelp();
  }
  
  process.exit(result ? 0 : 1);
}

main().catch(e => {
  log(`错误: ${e.message}`, 'error');
  process.exit(1);
});
