#!/usr/bin/env node
/**
 * wx-miniprogram-skill 测试脚本
 * 
 * 用法: node tests/run-tests.js
 */

const { execSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const SCRIPT_DIR = path.join(__dirname, '..', 'scripts');
const CLI = `node wx-miniprogram-ci.js`;

const TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'wxmini-ci-test-'));
const CONFIG_DIR = path.join(TMP_ROOT, 'config');
const PROJECT_DIR = path.join(TMP_ROOT, 'project');
const PRIVATE_KEY = path.join(TMP_ROOT, 'private.key');

fs.mkdirSync(CONFIG_DIR, { recursive: true });
fs.mkdirSync(PROJECT_DIR, { recursive: true });
fs.writeFileSync(path.join(PROJECT_DIR, 'project.config.json'), '{}', 'utf-8');
fs.writeFileSync(PRIVATE_KEY, 'dummy-key', 'utf-8');

function run(cmd, description) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`测试: ${description}`);
  console.log(`命令: ${cmd}`);
  console.log('='.repeat(50));
  try {
    const output = execSync(cmd, { cwd: SCRIPT_DIR, encoding: 'utf-8' });
    console.log(output);
    console.log('✅ 成功');
    return true;
  } catch (e) {
    console.log(e.stdout || e.message);
    console.log('❌ 失败');
    return false;
  }
}

console.log('🧪 wx-miniprogram-skill 测试套件\n');

let passed = 0;
let failed = 0;

// 测试 --help
if (run(`${CLI} --help`, '显示帮助信息')) passed++; else failed++;

// 测试 config（无参数）
if (run(`${CLI} config --config-dir "${CONFIG_DIR}"`, '查看当前配置（隔离配置目录）')) passed++; else failed++;

// 测试 config --get（无key）
if (run(`${CLI} config --get --config-dir "${CONFIG_DIR}"`, '获取全局配置（无key）')) passed++; else failed++;

// 测试 config --set（缺少值，预期报错）
if (!run(`${CLI} config --set appid --config-dir "${CONFIG_DIR}"`, '--set 缺少值（预期报错）')) passed++; else failed++;

// 测试 config --set
if (run(`${CLI} config --set appid=test_appid --config-dir "${CONFIG_DIR}"`, '设置配置项到隔离目录')) passed++; else failed++;

// 测试 config --get appid
if (run(`${CLI} config --get appid --config-dir "${CONFIG_DIR}"`, '获取隔离目录中的 appid')) passed++; else failed++;

// 测试 config --project myapp --set appid
if (run(`${CLI} config --project myapp --set appid=test_project_appid --config-dir "${CONFIG_DIR}"`, '设置项目配置项')) passed++; else failed++;

// 测试 config --project myapp --get appid
if (run(`${CLI} config --project myapp --get appid --config-dir "${CONFIG_DIR}"`, '获取项目 appid 配置')) passed++; else failed++;

// 测试 check 命令，使用临时项目目录和私钥文件
if (run(`${CLI} check --appid test_appid --private-key "${PRIVATE_KEY}" --project-path "${PROJECT_DIR}" --config-dir "${CONFIG_DIR}"`, '检查配置有效性（本地虚拟项目/私钥）')) passed++; else failed++;

console.log('\n' + '='.repeat(50));
console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
