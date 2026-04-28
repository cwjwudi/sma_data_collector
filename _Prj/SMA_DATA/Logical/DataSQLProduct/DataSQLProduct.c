
#include <bur/plctypes.h>

#ifdef _DEFAULT_INCLUDES
	#include <AsDefault.h>
#endif

void _INIT DataSQLProductInit(void)
{
	ProductDataSQLRev.FB01 = 0;
	
	for(int i=0; i<READ_QUERY_SIZE; i++)
	{
		brsstrcpy(ProductDataSQLQuery.Config.StartTime[i], "2026-4-1 10:00:00");
		brsstrcpy(ProductDataSQLQuery.Config.EndTime[i],   "2026-6-1 10:00:00");
	}
}

void _CYCLIC DataSQLProductCyclic(void)
{	
	/*******************************************************生产数据查询*******************************************************/
	//系统功能 - 当前系统时间
	SystemGetTime.enable = 1;
	DTGetTime(&SystemGetTime);
	
	SystemTimeAct = SystemGetTime.DT1;
	
	//生产数据存储
	if(gDataSQLOperate.ProductInsertReq)
	{
		gDataSQLOperate.ProductInsertReq = 0;
		gDataSQLOperate.ProductInsert	 = 1;
		
		//生产数据锁存
		gDataSQLProduct.TimeStamp = SystemTimeAct;
		gDataSQLProduct.State  	  = 2;
		gDataSQLProduct.CH01	  = 1;
		gDataSQLProduct.CH02	  = 2;
		gDataSQLProduct.CH03	  = 3;
		gDataSQLProduct.CH04	  = 4;
		gDataSQLProduct.CH05	  = 5;
		gDataSQLProduct.CH06	  = 6;
	}
	
	/*******************************************************生产数据查询*******************************************************/
	//生产数据查询配置
	brsstrcpy(ProductDataSQLQuery.Config.PointName[0], "DataProductTime");
	brsstrcpy(ProductDataSQLQuery.Config.PointName[1], "DataProductState");
	brsstrcpy(ProductDataSQLQuery.Config.PointName[2], "DataProductCH01");
	brsstrcpy(ProductDataSQLQuery.Config.PointName[3], "DataProductCH02");
	brsstrcpy(ProductDataSQLQuery.Config.PointName[4], "DataProductCH03");
	brsstrcpy(ProductDataSQLQuery.Config.PointName[5], "DataProductCH04");
	brsstrcpy(ProductDataSQLQuery.Config.PointName[6], "DataProductCH05");
	brsstrcpy(ProductDataSQLQuery.Config.PointName[7], "DataProductCH06");
	
	//生产数据查询缓存
	ProductDataSQLRev;
}

void _EXIT DataSQLProductExit(void)
{

}

