"""
数据库连接管理器
支持MySQL和SQLite数据库连接
"""

import logging
import os
from typing import Optional, Dict, Any
from datetime import datetime
import sqlite3
try:
    import pymysql
    MYSQL_AVAILABLE = True
except ImportError:
    MYSQL_AVAILABLE = False

from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker
from sqlalchemy.exc import SQLAlchemyError


class DatabaseManager:
    """数据库管理器类"""
    
    def __init__(self, db_config: Dict[str, Any], group_configs: Dict[str, Any] = None):
        """
        初始化数据库管理器
        
        Args:
            db_config: 数据库配置字典
            group_configs: 数据组配置字典，键为group_name，值为包含recreate_interval_days等参数的字典
        """
        self.db_config = db_config
        self.group_configs = group_configs or {}
        self.engine = None
        self.SessionLocal = None
        self.current_table_names = {}  # 使用字典存储不同group的当前表名
        self.table_created_dates = {}  # 存储不同group的表创建日期
        self.logger = logging.getLogger(__name__)
        # SQL 打印控制：默认 debug；设置 SD_SMA_SQL_LOG_INFO=true 可提升为 info
        self.sql_log_info = os.getenv("SD_SMA_SQL_LOG_INFO", "").lower() in ("1", "true", "yes", "on")

    def _log_mysql_sql(self, sql: str, params: Optional[Dict[str, Any]] = None, force_info: bool = False) -> None:
        """打印 MySQL SQL 语句与参数"""
        if self.db_config.get('type', '').lower() != 'mysql':
            return
        sql_text = " ".join(sql.split())
        message = f"MySQL SQL: {sql_text}"
        if params:
            message += f" | params={params}"
        if force_info or self.sql_log_info:
            self.logger.info(message)
        else:
            self.logger.debug(message)
        
        
    def connect(self) -> bool:
        """
        建立数据库连接
        
        Returns:
            bool: 连接是否成功
        """
        try:
            if self.db_config['type'].lower() == 'mysql':
                if not MYSQL_AVAILABLE:
                    raise ImportError("MySQL 驱动未安装，请安装 pymysql")
                
                from urllib.parse import quote_plus
                
                # 对密码进行 URL 编码，避免特殊字符导致解析错误
                encoded_password = quote_plus(self.db_config['password'])
                
                connection_string = (
                    f"mysql+pymysql://{self.db_config['username']}:"
                    f"{encoded_password}@"
                    f"{self.db_config['host']}:{self.db_config['port']}/"
                    f"{self.db_config['name']}?charset=utf8mb4"
                )
            else:  # sqlite
                connection_string = f"sqlite:///{self.db_config['name']}"
            
            self.engine = create_engine(
                connection_string,
                pool_pre_ping=True,
                echo=False
            )
            
            self.SessionLocal = sessionmaker(
                autocommit=False,
                autoflush=False,
                bind=self.engine
            )
            
            # 测试连接
            with self.engine.connect() as conn:
                conn.execute(text("SELECT 1"))

            # 初始化表日期信息
            self._initialize_table_dates()
            
            self.logger.info(f"成功连接到{self.db_config['type']}数据库: {self.db_config['name']}")
            return True
            
        except Exception as e:
            self.logger.error(f"数据库连接失败: {e}", exc_info=True)
            return False
    
    def disconnect(self) -> None:
        """断开数据库连接"""
        if self.engine:
            self.engine.dispose()
            self.logger.info("数据库连接已关闭")
    
    def get_session(self):
        """
        获取数据库会话
        
        Returns:
            Session: SQLAlchemy会话对象
        """
        if not self.SessionLocal:
            raise RuntimeError("数据库未连接")
        return self.SessionLocal()
    
    def create_data_table(self, table_name: str, columns: Dict[str, str]) -> bool:
        """
        创建数据表
        
        Args:
            table_name: 表名
            columns: 列定义字典 {列名: 数据类型}
            
        Returns:
            bool: 创建是否成功
        """
        try:
            # 构建CREATE TABLE语句
            column_definitions = []
            for col_name, col_type in columns.items():
                column_definitions.append(f"`{col_name}` {col_type}")
            
            # 添加通用字段
            column_definitions.extend([
                "`id` INTEGER PRIMARY KEY AUTOINCREMENT",
                "`collection_time` DATETIME NOT NULL",
                "`created_at` DATETIME DEFAULT CURRENT_TIMESTAMP"
            ])
            
            if self.db_config['type'].lower() == 'mysql':
                column_definitions[-3] = "`id` BIGINT AUTO_INCREMENT PRIMARY KEY"
                auto_increment = "AUTO_INCREMENT"
            else:
                auto_increment = "AUTOINCREMENT"
            
            create_sql = f"""
            CREATE TABLE IF NOT EXISTS `{table_name}` (
                {', '.join(column_definitions)}
            )
            """
            self._log_mysql_sql(create_sql, force_info=True)
            
            with self.engine.connect() as conn:
                conn.execute(text(create_sql))
                conn.commit()
            
            self.current_table_name = table_name
            self.table_created_date = datetime.now().date()
            self.logger.info(f"成功创建数据表: {table_name}")
            return True
            
        except Exception as e:
            self.logger.error(f"创建数据表失败: {e}", exc_info=True)
            return False
    
    def get_recreate_interval_days(self, group_name: str = None) -> int:
        """
        获取指定数据组的分表间隔天数
        
        Args:
            group_name: 数据组名称
            
        Returns:
            int: 分表间隔天数
        """
        # 这里需要通过外部传入group配置来获取参数
        # 暂时返回默认值，后续会通过参数传递解决
        return 30
    
    def get_current_table_name(self, group_name: str = None) -> str:
        """
        获取当前使用的表名（根据group_name和日期自动切换）
        
        Args:
            group_name: 数据组名称，如果为None则使用默认配置
            
        Returns:
            str: 当前表名
        """
        today = datetime.now()  # 使用datetime而不是date，保持类型一致
        
        # 如果没有指定group_name，使用配置中的第一个数据组
        if group_name is None:
            # 从配置中获取data_groups，如果没有则使用'default'
            data_groups = self.db_config.get('data_groups', [])
            if data_groups:
                group_name = data_groups[0]
            else:
                group_name = 'default'
        
        # 从group_configs获取该组的recreate_interval_days配置
        recreate_interval = 30  # 默认值
        if group_name in self.group_configs:
            recreate_interval = self.group_configs[group_name].get('recreate_interval_days', 30)
        
        # 检查该group是否已有表记录
        current_table_name = self.current_table_names.get(group_name)
        table_created_date = self.table_created_dates.get(group_name)
        
        if (not current_table_name or 
            not table_created_date or
            (today.date() - table_created_date.date()).days >= recreate_interval):

            # 生成新的表名：{group_name}_{日期}
            
            new_table_name = f"{group_name}_{today.strftime('%Y%m%d')}"
            
            self.logger.info(f"Group '{group_name}' 切换到新表: {new_table_name} (间隔: {recreate_interval}天)")
            self.current_table_names[group_name] = new_table_name
            self.table_created_dates[group_name] = today
            
        return self.current_table_names[group_name]
    
    def execute_query(self, sql: str, params: Optional[Dict] = None) -> list:
        """
        执行查询语句
        
        Args:
            sql: SQL查询语句
            params: 查询参数
            
        Returns:
            list: 查询结果
        """
        try:
            self._log_mysql_sql(sql, params)
            with self.engine.connect() as conn:
                result = conn.execute(text(sql), params or {})
                return result.fetchall()
        except Exception as e:
            self.logger.error(f"查询执行失败: {e}", exc_info=True)
            raise
    
    def execute_insert(self, table_name: str, data: Dict[str, Any]) -> bool:
        """
        插入数据
        
        Args:
            table_name: 表名
            data: 要插入的数据字典
            
        Returns:
            bool: 插入是否成功
        """
        try:
            columns = ', '.join([f"`{k}`" for k in data.keys()])
            placeholders = ', '.join([f":{k}" for k in data.keys()])
            
            sql = f"INSERT INTO `{table_name}` ({columns}) VALUES ({placeholders})"
            self._log_mysql_sql(sql, data)
            
            with self.engine.connect() as conn:
                conn.execute(text(sql), data)
                conn.commit()
            
            return True
        except Exception as e:
            self.logger.error(f"数据插入失败: {e}", exc_info=True)
            return False

    def _initialize_table_dates(self) -> None:
        """
        初始化数据库中所有表的日期信息
        扫描现有表，解析日期后缀，为每个group保存最新的日期
        """
        try:
            # 获取所有表名
            if self.db_config['type'].lower() == 'mysql':
                sql = "SHOW TABLES"
            else:  # sqlite
                sql = "SELECT name FROM sqlite_master WHERE type='table'"
            
            tables = self.execute_query(sql)
            table_name_str = ''
            # 解析表名并按group分类
            group_latest_dates = {}
            for table_row in tables:
                table_name = table_row[0] if isinstance(table_row, tuple) else table_row
                table_name_str = table_name[0]
                # 取表名最后8位作为日期字符串
                date_str = table_name_str[-8:]

                # 判断是否为有效日期
                if len(date_str) != 8 or not date_str.isdigit():
                    # 不是日期格式，跳过
                    continue
                try:
                    # 尝试将字符串解析为日期对象
                    parsed_date = datetime.strptime(date_str, '%Y%m%d')
                    group_name = table_name_str[:-9]  # 去掉下划线和日期
                    group_latest_dates[group_name] = parsed_date
                    # 更新该group的最新日期
                    if (group_name not in group_latest_dates or
                        parsed_date > group_latest_dates[group_name]):
                        group_latest_dates[group_name] = parsed_date
                    # print(f"提取的日期: {date_str} 是有效的日期")
                except ValueError:
                    # 日期格式不匹配，跳过该表
                    continue

            # 更新实例变量
            self.table_created_dates.update(group_latest_dates)
            
            # 为每个group生成对应的当前表名
            for group_name, latest_date in group_latest_dates.items():
                current_table_name = f"{group_name}_{latest_date.strftime('%Y%m%d')}"
                self.current_table_names[group_name] = current_table_name
            
            if group_latest_dates:
                self.logger.info(f"初始化表日期信息完成: {group_latest_dates}")
            else:
                self.logger.info("未找到符合条件的表，将使用默认表名策略")
                
        except Exception as e:
            self.logger.error(f"初始化表日期信息失败: {e}", exc_info=True)