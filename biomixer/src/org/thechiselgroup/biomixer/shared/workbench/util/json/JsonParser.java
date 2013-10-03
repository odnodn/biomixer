/*******************************************************************************
 * Copyright 2012 David Rusk
 *
 * Licensed under the Apache License, Version 2.0 (the "License"); 
 * you may not use this file except in compliance with the License. 
 * You may obtain a copy of the License at 
 *
 *    http://www.apache.org/licenses/LICENSE-2.0 
 *     
 * Unless required by applicable law or agreed to in writing, software 
 * distributed under the License is distributed on an "AS IS" BASIS, 
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. 
 * See the License for the specific language governing permissions and 
 * limitations under the License.  
 *******************************************************************************/
package org.thechiselgroup.biomixer.shared.workbench.util.json;

import java.util.Set;

public interface JsonParser {

    Integer asInt(Object intObject);

    Double asNumber(Object numberObject);

    String asString(Object text);

    Object get(Object array, int index);

    Object get(Object object, String property);

    boolean has(Object object, String property);

    boolean isArray(Object object);

    int length(Object array);

    Object parse(String json);

    public Object getPossiblyMissing(Object object, String property);

    public String getIntAsString(Object object, String property);

    Set<String> getObjectProperties(Object jsonValue);

}
