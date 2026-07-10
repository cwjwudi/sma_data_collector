(*DataSQL types matching sma_data_collect OPC paths*)

TYPE
	DataSQLOperate_typ : 	STRUCT 
		RecipeRead : BOOL;
		RecipeReadStatus : UINT;
		RecipeInsert : BOOL;
		RecipeInsertReq : BOOL;
		ProductRead : BOOL;
		ProductReadStatus : UINT;
		ProductInsert : BOOL;
		ProductInsertReq : BOOL;
		ProductInsertStatus : UDINT;
		AuditRead : BOOL;
		AuditReadStatus : UINT;
		AuditInsertFault : BOOL;
		AlarmRead : BOOL;
		AlarmReadStatus : UINT;
		AlarmInsertFault : BOOL;
		BatchInsert : BOOL;
		BatchInfoInsert : BOOL;
	END_STRUCT;
END_TYPE

TYPE
	DataSQLQueryConfig_typ : 	STRUCT 
		StartTime : ARRAY[0..DATA_SQL_QUERY_SIZE_MINUS]OF STRING[20];
		EndTime : ARRAY[0..DATA_SQL_QUERY_SIZE_MINUS]OF STRING[20];
		PointName : ARRAY[0..DATA_SQL_QUERY_SIZE_MINUS]OF STRING[20];
		AuxQuery : ARRAY[0..DATA_SQL_QUERY_SIZE_MINUS]OF STRING[80];
	END_STRUCT;
	DataSQLQueryCmd_typ : 	STRUCT 
		Next : BOOL;
	END_STRUCT;
	DataSQLQuery_typ : 	STRUCT 
		Config : DataSQLQueryConfig_typ;
		Cmd : DataSQLQueryCmd_typ;
	END_STRUCT;
END_TYPE

(*Recipe insert snapshot - scalar, for collector trigger read*)
TYPE
	DataSQLRecipe_typ : 	STRUCT 
		TimeStamp : DATE_AND_TIME;
		State : UDINT;
		CH00 : REAL;
		CH01 : REAL;
		CH02 : REAL;
		CH03 : REAL;
		CH04 : REAL;
		CH05 : REAL;
		CH06 : REAL;
		CH07 : REAL;
		CH08 : REAL;
		CH09 : REAL;
		CH10 : REAL;
		CH11 : REAL;
		CH12 : REAL;
		CH13 : REAL;
		CH14 : REAL;
		CH15 : REAL;
		CH16 : REAL;
		CH17 : REAL;
		CH18 : REAL;
		CH19 : REAL;
		CH20 : REAL;
		CH21 : REAL;
		CH22 : REAL;
		CH23 : REAL;
		CH24 : REAL;
		CH25 : REAL;
	END_STRUCT;
END_TYPE

(*Product insert snapshot*)
TYPE
	DataSQLProduct_typ : 	STRUCT 
		TimeStamp : DATE_AND_TIME;
		State : UDINT;
		CH01 : REAL;
		CH02 : REAL;
		CH03 : REAL;
		CH04 : REAL;
		CH05 : REAL;
		CH06 : REAL;
	END_STRUCT;
END_TYPE

TYPE
	DataSQLBatch_typ : 	STRUCT 
		BatchCode : STRING[40];
		BatchTimeStart : DATE_AND_TIME;
		BatchTimeStop : DATE_AND_TIME;
	END_STRUCT;
END_TYPE

TYPE
	DataSQLBatchInfo_typ : 	STRUCT 
		InfoProductName : STRING[80];
		InfoProductDesc : STRING[80];
		InfoConfigure : STRING[80];
		InfoRecipe : STRING[80];
		InfoTabletWeight : REAL;
		InfoTabletHardness : REAL;
		InfoTabletMoldXY : STRING[40];
		InfoTabletDiameterX : REAL;
		InfoTabletDiameterY : REAL;
		InfoTabletMoldZ : STRING[40];
		InfoTabletThicknessZ : REAL;
		InfoTabletRadiusR : REAL;
		InfoBatchStart : DATE_AND_TIME;
		InfoBatchStop : DATE_AND_TIME;
		InfoBatchRun : TIME;
		InfoPieceAccept : UDINT;
		InfoPieceDebug : UDINT;
		InfoPieceTotal : UDINT;
	END_STRUCT;
END_TYPE

TYPE
	AlarmInsertBuffer_typ : 	STRUCT 
		AlarmTime : DATE_AND_TIME;
		AlarmCode : UDINT;
		AlarmState : UDINT;
		AlarmText : STRING[80];
		InsertTrigger : BOOL;
		AlarmBatch : STRING[40];
	END_STRUCT;
END_TYPE

TYPE
	AuditInsertBuffer_typ : 	STRUCT 
		AuditTime : DATE_AND_TIME;
		AuditOperator : STRING[32];
		AuditText : STRING[100];
		InsertTrigger : BOOL;
		AuditBatch : STRING[40];
	END_STRUCT;
END_TYPE
