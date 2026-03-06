import datetime

group_name = "group"
today = datetime.datetime.now()

new_table_name = f"{group_name}_{today.strftime('%Y%m%d')}"

# 提取最后8位字符串作为日期
date_str = new_table_name[-8:]

# 判断是否为有效日期
try:
    # 尝试将字符串解析为日期对象
    parsed_date = datetime.datetime.strptime(date_str, '%Y%m%d')
    print(f"提取的日期: {date_str} 是有效的日期")
except ValueError:
    print(f"提取的日期: {date_str} 不是有效的日期")

datetime.datetime.strptime("dasss", '%Y%m%d')

print(new_table_name)