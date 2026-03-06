import json

# 读取配置文件
with open('config/sample_config.json', 'r', encoding='utf-8') as f:
    config = json.load(f)

print("=== 数据组配置 ===")
for group in config['groups']:
    print(f"组名: {group['name']}")
    print(f"  触发方式: {group['trigger']}")
    print(f"  数据点: {group['data_points']}")
    print(f"  触发点: {group['trigger_point']}")
    print()

print("=== 数据库配置 ===")
print(f"数据组: {config['database']['data_groups']}")

print("\n=== 详细分析 ===")
sensor_group = [g for g in config['groups'] if g['name'] == 'sensor_group_1'][0]
motor_group = [g for g in config['groups'] if g['name'] == 'motor_group'][0]

print(f"sensor_group_1 应该采集: {sensor_group['data_points']}")
print(f"motor_group 应该采集: {motor_group['data_points']}")

# 检查是否有重复或交叉的数据点
sensor_points = set(sensor_group['data_points'])
motor_points = set(motor_group['data_points'])

print(f"\n重复的数据点: {sensor_points.intersection(motor_points)}")
print(f"sensor_group_1 独有: {sensor_points.difference(motor_points)}")
print(f"motor_group 独有: {motor_points.difference(sensor_points)}")
