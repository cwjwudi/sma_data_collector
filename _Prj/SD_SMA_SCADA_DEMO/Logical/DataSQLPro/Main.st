
PROGRAM _INIT
	ProductDataSQLQuery.Config.PointName[0] := 'DataProductTime';
	ProductDataSQLQuery.Config.PointName[1] := 'DataProductState';
	ProductDataSQLQuery.Config.PointName[2] := 'DataProductCH01';
	ProductDataSQLQuery.Config.PointName[3] := 'DataProductCH02';
	ProductDataSQLQuery.Config.PointName[4] := 'DataProductCH03';
	ProductDataSQLQuery.Config.PointName[5] := 'DataProductCH04';
	ProductDataSQLQuery.Config.PointName[6] := 'DataProductCH05';
	ProductDataSQLQuery.Config.PointName[7] := 'DataProductCH06';
END_PROGRAM

PROGRAM _CYCLIC
	(*查询配置由采集端/HMI写入，此处仅保持变量存在*)
	ProductDataSQLQuery;
END_PROGRAM

PROGRAM _EXIT

END_PROGRAM
