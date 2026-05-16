#!/usr/bin/env node
/**
 * wx-miniprogram-skill 测试脚本
 * 
 * 用法: node tests/run-tests.js
 */

const { execSync } = require('child_process');
const path = require('path');

const SCRIPT_DIR = path.join(__dirname, '..', 'scripts');
const CLI = `node wxmini-ci.js`;

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
if (run(`${CLI} config`, '查看当前配置')) passed++; else failed++;

// 测试 config --get（无key）
if (run(`${CLI} config --get`, '--get 无参数')) passed++; else failed++;

// 测试 config --get appid
if (run(`${CLI} config --get appid`, '获取 appid 配置')) passed++; else failed++;

// 测试 config --set
if (run(`${CLI} config --set testkey testvalue`, '设置配置项')) passed++; else failed++;

// 测试 config --get testkey
if (run(`${CLI} config --get testkey`, '获取刚设置的配置项')) passed++; else failed++;

// 测试 config --set（无参数，预期报错）
if (!run(`${CLI} config --set`, '--set 无参数（预期报错）')) passed++; else failed++;

console.log('\n' + '='.repeat(50));
console.log(`测试结果: ${passed} 通过, ${failed} 失败`);
console.log('='.repeat(50));

process.exit(failed > 0 ? 1 : 0);
