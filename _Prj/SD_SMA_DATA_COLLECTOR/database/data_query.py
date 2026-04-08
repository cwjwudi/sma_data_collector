"""
数据查询处理器
负责从数据库查询历史数据并导出到CSV文件
"""

from dataclasses import dataclass, field
from datetime import datetime, timedelta
import re
from dataclasses import dataclass
import logging
from telnetlib import theNULL
from typing import Dict, List, Any, Optional
from datetime import date, datetime
import csv
import os
# 处理相对导入问题
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from database.db_manager import DatabaseManager


class DataQueryProcessor:
    """数据查询处理器类"""
    
    def __init__(self, db_manager: DatabaseManager):
        """
        初始化数据查询处理器
        
        Args:
            db_manager: 数据库管理器实例
        """
        self.db_manager = db_manager
        self.logger = logging.getLogger(__name__)
    
    def query_data(self, 
                   start_times: List[datetime],
                   end_times: List[datetime],
                   point_names: List[str],
                   group_names: List[str],
                   output_file: Optional[str] = None,
                   return_data: bool = True,
                   by_what_time: Optional[str] = None) -> Optional[tuple[List[List[Any]], List[List[datetime]], int]]:
        """
        查询指定时间段内的数据并可选导出到 CSV 文件
        
        Args:
            start_times: 开始时间
            end_times: 结束时间
            point_names: 数据点名称列表
            output_file: 输出 CSV 文件路径（可选）
            return_data: 是否直接返回数据（默认 True）
            by_what_time: 自定义时间字段名（可选，默认使用 collection_time）
            
        Returns:
            查询结果列表，失败时返回 None
        """
        try:
            # 确定涉及的表名
            table_names = group_names
            
            if not table_names:
                self.logger.warning("指定时间段内没有数据表")
                return []
            
            # 构建查询 SQL
            all_data = []

            # 将具有相同start_time、end_time、table_name的point合并到字典中
            rebuild_datas_dict = {}

            for i in range(len(point_names)):
                if group_names[i] is None:
                    continue
                
                key = (group_names[i], start_times[i], end_times[i])
                
                if key not in rebuild_datas_dict:
                    rebuild_datas_dict[key] = []
                
                rebuild_datas_dict[key].append(point_names[i])

            
            # 创建point_name到索引的映射
            point_to_idx = {name: idx for idx, name in enumerate(point_names)}
            
            for key, points in rebuild_datas_dict.items():
                table_name, start_time, end_time = key
                table_data = self._query_table_data(table_name, start_time, end_time, points, by_what_time)
                all_data.extend(table_data)
                
            # 按时间排序
            # all_data.sort(key=lambda x: x['collection_time'])
            
            # 如果指定了输出文件，导出到 CSV
            if output_file:
                self._export_to_csv(all_data, point_names, output_file, by_what_time)
            
            # 确定时间字段名：如果配置了 by_what_time 则使用，否则默认使用 collection_time
            time_field = by_what_time if by_what_time else 'collection_time'
            
            _all_data = [[] for _ in range(len(point_names))]
            _all_time = [[] for _ in range(len(point_names))]
            for rec in all_data:
                for key in rec:
                    if key == time_field:
                        continue
                    else:
                        _all_time[point_to_idx[key]].append(rec[time_field])
                        # 将 NULL 值转换为 0.0
                        value = rec[key]
                        if value is None:
                            value = 0.0
                        else:
                            try:
                                value = float(value)
                            except (TypeError, ValueError):
                                value = 0.0
                        _all_data[point_to_idx[key]].append(value)

            # 如果需要返回数据
            if return_data:
                self.logger.info(f"查询完成，共获取 {len(all_data)} 条记录")
                return _all_data, _all_time, len(all_data)
            
            return [], [], 0
            
        except Exception as e:
            self.logger.error(f"数据查询失败：{e}")
            return None
    
    def _get_tables_for_period(self, start_time: datetime, end_time: datetime) -> List[str]:
        """
        获取指定时间段内可能涉及的表名
        
        Args:
            start_time: 开始时间
            end_time: 结束时间
            
        Returns:
            List[str]: 表名列表
        """
        table_names = []
        current_date = start_time.date()
        end_date = end_time.date()
        
        # 根据日期生成可能的表名
        while current_date <= end_date:
            table_prefix = self.db_manager.db_config['name'].split('.')[0]
            table_name = f"{table_prefix}_{current_date.strftime('%Y%m%d')}"
            table_names.append(table_name)
            current_date = datetime.fromordinal(current_date.toordinal() + 1).date()
        
        return table_names
    
    def _query_table_data(self, 
                        table_name: str,
                        start_time: datetime,
                        end_time: datetime,
                        point_names: List[str],
                        by_what_time: Optional[str] = None) -> List[Dict[str, Any]]:
        """
        查询单个逻辑表（可能对应多个带日期后缀的物理表）中的数据
        
        Args:
            table_name: 逻辑表名（如 'sensor_group_1'）
            start_time: 开始时间
            end_time: 结束时间
            point_names: 数据点名称列表
            by_what_time: 自定义时间字段名（可选，默认使用 collection_time）
            
        Returns:
            List[Dict[str, Any]]: 查询结果（按时间字段排序）
        """
        # 确定时间字段名：如果配置了 by_what_time 则使用，否则默认使用 collection_time
        time_field = by_what_time if by_what_time else 'collection_time'
        
        try:
            # 步骤1: 获取所有匹配的物理表名
            candidate_tables = self._get_matching_tables(table_name, start_time, end_time)
            if not candidate_tables:
                self.logger.debug(f"未找到与时间范围 [{start_time}, {end_time}] 匹配的表（基于逻辑表名 {table_name}）")
                return []

            # 步骤2: 对每个物理表执行查询并合并结果
            all_results = []
            columns = [time_field] + point_names
            columns_str = ', '.join([f"`{col}`" for col in columns])

            for physical_table in candidate_tables:
                # 构建 WHERE 条件，使用自定义时间字段（如果有）
                where_clause = f"`{time_field}` BETWEEN :start AND :end"

                sql = f"SELECT {columns_str} FROM `{physical_table}` WHERE {where_clause} ORDER BY `{time_field}`"
                params = {
                    'start': start_time,
                    'end': end_time
                }
                results = self.db_manager.execute_query(sql, params)

                # 转换为字典
                for row in results:
                    row_dict = dict(zip(columns, row))
                    all_results.append(row_dict)

            # 步骤3: 按时间字段排序（跨表后可能无序）
            all_results.sort(key=lambda x: x[time_field])

            self.logger.debug(f"从逻辑表 {table_name}（实际查询 {len(candidate_tables)} 张物理表）共获取 {len(all_results)} 条记录，时间字段: {time_field}")
            return all_results

        except Exception as e:
            self.logger.warning(f"查询逻辑表 {table_name} 失败: {e}")
            return []


    def _get_matching_tables(self, base_table_name: str, start_time: datetime, end_time: datetime) -> List[str]:
        """
        根据时间范围，找出所有匹配的带日期后缀的物理表
        
        假设表命名规则: {base_table_name}_{YYYYMMDD}
        每张表存储一天的数据（00:00:00 到 23:59:59.999999）
        """
        # 获取数据库中所有表名
        if self.db_manager.db_config['type'].lower() == 'mysql':
            sql = "SHOW TABLES"
            tables = [row[0] for row in self.db_manager.execute_query(sql)]
        else:  # sqlite
            sql = "SELECT name FROM sqlite_master WHERE type='table';"
            tables = [row[0] for row in self.db_manager.execute_query(sql)]

        # 构造正则匹配模式
        pattern = re.compile(rf'^{re.escape(base_table_name)}_(\d{{8}})$')
        
        matching_tables = []
        current_date = start_time.date()
        end_date = end_time.date()

        # 预生成所有需要的日期（避免遗漏边界）
        required_dates = set()
        delta = timedelta(days=1)
        d = current_date
        while d <= end_date:
            required_dates.add(d.strftime('%Y%m%d'))
            d += delta

        for table in tables:
            match = pattern.match(table)
            if match:
                date_str = match.group(1)
                if date_str in required_dates:
                    matching_tables.append(table)

        return sorted(matching_tables)  # 可选：按日期排序
    
    def _export_to_csv(self, 
                      data: List[Dict[str, Any]],
                      point_names: List[str],
                      output_file: str,
                      by_what_time: Optional[str] = None) -> bool:
        """
        导出数据到CSV文件
        
        Args:
            data: 要导出的数据
            point_names: 数据点名称列表
            output_file: 输出文件路径
            by_what_time: 自定义时间字段名（可选，默认使用 collection_time）
            
        Returns:
            bool: 导出是否成功
        """
        # 确定时间字段名：如果配置了 by_what_time 则使用，否则默认使用 collection_time
        time_field = by_what_time if by_what_time else 'collection_time'
        
        try:
            # 确保输出目录存在
            output_dir = os.path.dirname(output_file)
            if output_dir and not os.path.exists(output_dir):
                os.makedirs(output_dir)
            
            # 写入CSV文件
            with open(output_file, 'w', newline='', encoding='utf-8') as csvfile:
                fieldnames = [time_field] + point_names
                writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
                
                # 写入表头
                writer.writeheader()
                
                # 写入数据
                for row in data:
                    # 处理时间格式
                    row_copy = row.copy()
                    if time_field in row_copy:
                        row_copy[time_field] = row_copy[time_field].strftime('%Y-%m-%d %H:%M:%S')
                    writer.writerow(row_copy)
            
            self.logger.info(f"数据已成功导出到: {output_file}，共 {len(data)} 条记录")
            return True
            
        except Exception as e:
            self.logger.error(f"导出CSV文件失败: {e}")
            return False
    
    def get_available_points(self) -> List[str]:
        """
        获取可用的数据点名称
        
        Returns:
            List[str]: 数据点名称列表
        """
        try:
            # 获取当前表名
            current_table = self.db_manager.get_current_table_name()
            
            # 查询表结构
            if self.db_manager.db_config['type'].lower() == 'mysql':
                sql = """
                SELECT COLUMN_NAME 
                FROM INFORMATION_SCHEMA.COLUMNS 
                WHERE TABLE_NAME = %s 
                AND COLUMN_NAME NOT IN ('id', 'collection_time', 'created_at')
                """
                params = (current_table,)
            else:  # sqlite
                sql = f"PRAGMA table_info(`{current_table}`)"
                params = None
            
            results = self.db_manager.execute_query(sql, params)
            
            if self.db_manager.db_config['type'].lower() == 'mysql':
                point_names = [row[0] for row in results]
            else:
                # SQLite返回 (cid, name, type, notnull, dflt_value, pk)
                point_names = [row[1] for row in results if row[1] not in ['id', 'collection_time', 'created_at']]
            
            return point_names
            
        except Exception as e:
            self.logger.error(f"获取可用数据点失败: {e}")
            return []


