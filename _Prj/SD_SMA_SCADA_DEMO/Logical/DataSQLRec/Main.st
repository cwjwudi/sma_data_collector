
PROGRAM _INIT
	RecipeDataSQLQuery.Config.PointName[0] := 'DataRecipeTime';
	RecipeDataSQLQuery.Config.PointName[1] := 'DataRecipeState';
	RecipeDataSQLQuery.Config.PointName[2] := 'DataRecipeCH00';
	RecipeDataSQLQuery.Config.PointName[3] := 'DataRecipeCH01';
	RecipeDataSQLQuery.Config.PointName[4] := 'DataRecipeCH02';
	RecipeDataSQLQuery.Config.PointName[5] := 'DataRecipeCH03';
	RecipeDataSQLQuery.Config.PointName[6] := 'DataRecipeCH04';
	RecipeDataSQLQuery.Config.PointName[7] := 'DataRecipeCH05';
	RecipeDataSQLQuery.Config.PointName[8] := 'DataRecipeCH06';
	RecipeDataSQLQuery.Config.PointName[9] := 'DataRecipeCH07';
	RecipeDataSQLQuery.Config.PointName[10] := 'DataRecipeCH08';
	RecipeDataSQLQuery.Config.PointName[11] := 'DataRecipeCH09';
	RecipeDataSQLQuery.Config.PointName[12] := 'DataRecipeCH10';
	RecipeDataSQLQuery.Config.PointName[13] := 'DataRecipeCH11';
	RecipeDataSQLQuery.Config.PointName[14] := 'DataRecipeCH12';
	RecipeDataSQLQuery.Config.PointName[15] := 'DataRecipeCH13';
	RecipeDataSQLQuery.Config.PointName[16] := 'DataRecipeCH14';
	RecipeDataSQLQuery.Config.PointName[17] := 'DataRecipeCH15';
	RecipeDataSQLQuery.Config.PointName[18] := 'DataRecipeCH16';
	RecipeDataSQLQuery.Config.PointName[19] := 'DataRecipeCH17';
	RecipeDataSQLQuery.Config.PointName[20] := 'DataRecipeCH18';
	RecipeDataSQLQuery.Config.PointName[21] := 'DataRecipeCH19';
	RecipeDataSQLQuery.Config.PointName[22] := 'DataRecipeCH20';
	RecipeDataSQLQuery.Config.PointName[23] := 'DataRecipeCH21';
	RecipeDataSQLQuery.Config.PointName[24] := 'DataRecipeCH22';
	RecipeDataSQLQuery.Config.PointName[25] := 'DataRecipeCH23';
	RecipeDataSQLQuery.Config.PointName[26] := 'DataRecipeCH24';
	RecipeDataSQLQuery.Config.PointName[27] := 'DataRecipeCH25';
END_PROGRAM

PROGRAM _CYCLIC
	(*查询配置由采集端/HMI写入，此处仅保持变量存在*)
	RecipeDataSQLQuery;
END_PROGRAM

PROGRAM _EXIT

END_PROGRAM
