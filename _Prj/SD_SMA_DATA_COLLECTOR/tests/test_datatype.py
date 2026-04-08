"""
测试 datatype 功能
验证 datetime 类型转换是否正常工作
"""

import sys
import os
from datetime import datetime

# 添加项目根目录到路径
project_root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, project_root)

from core.config_loader import ConfigLoader
from database.data_storage import DataStorageProcessor


def test_datatype_parsing():
    """测试配置文件中 datatype 的解析"""
    print("=" * 60)
    print("测试 1: 配置文件 datatype 解析")
    print("=" * 60)
    
    config = ConfigLoader.load_from_file('config/Alarm_trend.json')
    
    # 查找 ts 数据点
    ts_point = None
    for point in config.points:
        if point.name == 'ts':
            ts_point = point
            break
    
    if ts_point:
        print(f"✓ 找到 ts 数据点")
        print(f"  - name: {ts_point.name}")
        print(f"  - path: {ts_point.path}")
        print(f"  - description: {ts_point.description}")
        print(f"  - datatype: {ts_point.datatype}")
        
        if ts_point.datatype == 'datetime':
            print("✓ datatype 正确设置为 'datetime'")
        else:
            print(f"✗ datatype 应该是 'datetime'，但实际是 '{ts_point.datatype}'")
            return False
    else:
        print("✗ 未找到 ts 数据点")
        return False
    
    print()
    return True


def test_datetime_conversion():
    """测试 datetime 类型转换"""
    print("=" * 60)
    print("测试 2: datetime 类型转换")
    print("=" * 60)
    
    # 创建模拟的数据点配置
    from core.config_models import DataPoint
    
    points_dict = {
        'ts': DataPoint(
            name='ts',
            path='ns=6;s=::AlarmQuerr:ts',
            description='报警时间戳',
            datatype='datetime'
        ),
        'code': DataPoint(
            name='code',
            path='ns=6;s=::AlarmQuerr:Code',
            description='报警码',
            datatype=None  # 没有 datatype
        )
    }
    
    # 创建存储处理器（不需要真实的数据库连接）
    class MockDBManager:
        pass
    
    processor = DataStorageProcessor(
        db_manager=MockDBManager(),
        batch_size=10,
        points_dict=points_dict
    )
    
    # 测试不同的时间格式
    test_cases = [
        ('2024-01-15 10:30:45', '%Y-%m-%d %H:%M:%S'),
        ('2024-01-15 10:30:45.123456', '%Y-%m-%d %H:%M:%S.%f'),
        ('2024-01-15T10:30:45', '%Y-%m-%dT%H:%M:%S'),
        ('2024/01/15 10:30:45', '%Y/%m/%d %H:%M:%S'),
    ]
    
    all_passed = True
    
    for time_str, expected_format in test_cases:
        # 构造模拟的采集数据
        collection_data = {
            'group_name': 'test_group',
            'collection_time': datetime.now(),
            'trigger_type': 'time',
            'data': {
                'ts': {'value': time_str},
                'code': {'value': 'ALM001'}
            }
        }
        
        # 转换数据
        converted_data = processor._convert_to_db_format(collection_data)
        
        if converted_data:
            ts_value = converted_data.get('ts')
            
            if isinstance(ts_value, datetime):
                print(f"✓ 成功将 '{time_str}' 转换为 datetime 对象")
                print(f"  - 原始值: {time_str}")
                print(f"  - 转换后: {ts_value}")
                print(f"  - 类型: {type(ts_value).__name__}")
            else:
                print(f"✗ 转换失败: '{time_str}' -> {ts_value} (类型: {type(ts_value).__name__})")
                all_passed = False
        else:
            print(f"✗ 数据转换返回 None")
            all_passed = False
        
        print()
    
    return all_passed


def test_column_type_inference():
    """测试列类型推断（基于 datatype 配置）"""
    print("=" * 60)
    print("测试 3: 列类型推断（基于 datatype 配置）")
    print("=" * 60)
    
    from core.config_models import DataPoint
    
    points_dict = {
        'ts': DataPoint(
            name='ts',
            path='test_path',
            description='时间戳',
            datatype='datetime'  # 应该是 DATETIME
        ),
        'code': DataPoint(
            name='code',
            path='test_path',
            description='报警码',
            datatype=None  # 没有 datatype，基于值推断
        ),
        'value': DataPoint(
            name='value',
            path='test_path',
            description='数值',
            datatype='float'  # 应该是 DOUBLE
        ),
        'count': DataPoint(
            name='count',
            path='test_path',
            description='计数',
            datatype='int'  # 应该是 INTEGER
        ),
        'status': DataPoint(
            name='status',
            path='test_path',
            description='状态',
            datatype='bool'  # 应该是 BOOLEAN
        )
    }
    
    class MockDBManager:
        pass
    
    processor = DataStorageProcessor(
        db_manager=MockDBManager(),
        batch_size=10,
        points_dict=points_dict
    )
    
    # 测试样本数据
    sample_data = {
        'group_name': 'test_group',
        'collection_time': datetime.now(),
        'trigger_type': 'time',
        'data': {
            'ts': {'value': '2024-01-15 10:30:45'},  # 字符串，但配置了 datetime
            'code': {'value': 'ALM001'},  # 字符串，没有配置
            'value': {'value': 3.14},  # float
            'count': {'value': 100},  # int
            'status': {'value': True}  # bool
        }
    }
    
    column_types = processor._infer_column_types(sample_data)
    
    print("\n列类型推断结果:")
    all_passed = True
    
    # 验证 ts 应该是 DATETIME（基于配置）
    if column_types.get('ts') == 'DATETIME':
        print(f"✓ ts: {column_types['ts']} (基于 datatype='datetime')")
    else:
        print(f"✗ ts: {column_types.get('ts')} (应该是 DATETIME，基于 datatype='datetime')")
        all_passed = False
    
    # 验证 code 应该是 VARCHAR(255)（没有 datatype，基于值推断为字符串）
    if column_types.get('code') == 'VARCHAR(255)':
        print(f"✓ code: {column_types['code']} (基于值推断)")
    else:
        print(f"✗ code: {column_types.get('code')} (应该是 VARCHAR(255))")
        all_passed = False
    
    # 验证 value 应该是 DOUBLE（基于配置）
    if column_types.get('value') == 'DOUBLE':
        print(f"✓ value: {column_types['value']} (基于 datatype='float')")
    else:
        print(f"✗ value: {column_types.get('value')} (应该是 DOUBLE，基于 datatype='float')")
        all_passed = False
    
    # 验证 count 应该是 INTEGER（基于配置）
    if column_types.get('count') == 'INTEGER':
        print(f"✓ count: {column_types['count']} (基于 datatype='int')")
    else:
        print(f"✗ count: {column_types.get('count')} (应该是 INTEGER，基于 datatype='int')")
        all_passed = False
    
    # 验证 status 应该是 BOOLEAN（基于配置）
    if column_types.get('status') == 'BOOLEAN':
        print(f"✓ status: {column_types['status']} (基于 datatype='bool')")
    else:
        print(f"✗ status: {column_types.get('status')} (应该是 BOOLEAN，基于 datatype='bool')")
        all_passed = False
    
    print()
    return all_passed


def main():
    """运行所有测试"""
    print("\n开始测试 datatype 功能\n")
    
    results = []
    
    # 测试 1: 配置解析
    try:
        results.append(("配置解析", test_datatype_parsing()))
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        results.append(("配置解析", False))
    
    # 测试 2: datetime 转换
    try:
        results.append(("datetime 转换", test_datetime_conversion()))
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        results.append(("datetime 转换", False))
    
    # 测试 3: 列类型推断
    try:
        results.append(("列类型推断", test_column_type_inference()))
    except Exception as e:
        print(f"✗ 测试失败: {e}")
        import traceback
        traceback.print_exc()
        results.append(("列类型推断", False))
    
    # 汇总结果
    print("=" * 60)
    print("测试结果汇总")
    print("=" * 60)
    
    for test_name, passed in results:
        status = "✓ 通过" if passed else "✗ 失败"
        print(f"{test_name}: {status}")
    
    all_passed = all(result[1] for result in results)
    
    print()
    if all_passed:
        print("🎉 所有测试通过！")
    else:
        print("⚠️  部分测试失败，请检查上述错误信息")
    
    return 0 if all_passed else 1


if __name__ == '__main__':
    exit(main())
